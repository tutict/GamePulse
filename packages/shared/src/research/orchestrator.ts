import {
  ResearchIdentityAmbiguousError,
  type ResearchCollector,
  type ResearchProgressCallback,
  type ResearchReportGenerator,
  type ResearchRepository
} from "./contracts.js";
import { validateResearchReport } from "./reportGenerator.js";
import type {
  ResearchEvidence,
  ResearchRecord,
  ResearchStage,
  SentimentReportVersion
} from "./types.js";

const stages: ResearchStage[] = [
  "identity",
  "discovery",
  "collection",
  "cleaning",
  "report"
];

const stageMessages: Record<ResearchStage, string> = {
  identity: "正在确认目标游戏身份",
  discovery: "正在整理固定验证样本来源",
  collection: "正在读取固定验证样本",
  cleaning: "正在去重并筛选有效证据",
  report: "正在生成带引用的风评报告"
};

export interface RunResearchInput {
  research: ResearchRecord;
  collector: ResearchCollector;
  reportGenerator: ResearchReportGenerator;
  repository: ResearchRepository;
  signal?: AbortSignal;
  onProgress?: ResearchProgressCallback;
  now?: () => string;
}

export async function runResearch(input: RunResearchInput): Promise<ResearchRecord> {
  const now = input.now ?? (() => new Date().toISOString());
  const research = structuredClone(input.research);
  research.status = "running";
  research.error = undefined;
  research.identityCandidates = undefined;

  try {
    for (const stage of stages) {
      research.stage = stage;
      research.progressMessage = stageMessages[stage];
      await persist(research, input.repository, now, input.onProgress);
      throwIfAborted(input.signal);

      if (stage === "collection") {
        const result = await input.collector.collect(
          structuredClone(research.request),
          input.signal
        );
        throwIfAborted(input.signal);
        research.sources = structuredClone(result.sources);
        research.evidence = structuredClone(result.evidence);
        await persist(research, input.repository, now, input.onProgress);
      }

      if (stage === "cleaning") {
        research.evidence = deduplicateEvidence(research.evidence);
        await persist(research, input.repository, now, input.onProgress);
      }

      if (stage === "report") {
        const report = await generateReportWithRetry(
          research,
          input.reportGenerator
        );
        throwIfAborted(input.signal);
        research.reports = [...research.reports, report];
        await persist(research, input.repository, now, input.onProgress);
      }
    }

    research.status = "completed";
    research.progressMessage = "研究完成";
    await persist(research, input.repository, now, input.onProgress);
    return research;
  } catch (error) {
    if (error instanceof ResearchIdentityAmbiguousError) {
      research.status = "needs_input";
      research.stage = "identity";
      research.progressMessage = "请选择要研究的具体游戏";
      research.identityCandidates = structuredClone(error.candidates);
      research.error = undefined;
    } else if (input.signal?.aborted || isAbortError(error)) {
      research.status = "cancelled";
      research.progressMessage = "研究已取消";
      research.error = undefined;
    } else {
      research.status = "failed";
      research.progressMessage = "研究未完成，可保留现有证据后重试";
      research.error = errorMessage(error);
    }
    await persist(research, input.repository, now, input.onProgress);
    return research;
  }
}

export async function continueResearchWithIdentity(input: {
  research: ResearchRecord;
  candidateId: string;
  collector: ResearchCollector;
  reportGenerator: ResearchReportGenerator;
  repository: ResearchRepository;
  signal?: AbortSignal;
  onProgress?: ResearchProgressCallback;
  now?: () => string;
}): Promise<ResearchRecord> {
  const candidateId = input.candidateId.trim();
  if (!input.research.identityCandidates?.some((candidate) => candidate.id === candidateId)) {
    throw new Error("Research identity candidate was not found");
  }

  const research = structuredClone(input.research);
  research.request.identityId = candidateId;
  research.identityCandidates = undefined;
  research.status = "pending";
  research.error = undefined;
  return runResearch({ ...input, research });
}

export async function refreshResearch(input: {
  research: ResearchRecord;
  collector: ResearchCollector;
  reportGenerator: ResearchReportGenerator;
  repository: ResearchRepository;
  signal?: AbortSignal;
  onProgress?: ResearchProgressCallback;
  now?: () => string;
}): Promise<ResearchRecord> {
  const research = structuredClone(input.research);
  research.status = "pending";
  research.stage = undefined;
  research.progressMessage = undefined;
  research.sources = [];
  research.evidence = [];
  research.identityCandidates = undefined;
  research.error = undefined;
  return runResearch({ ...input, research });
}

export async function regenerateResearchReport(input: {
  research: ResearchRecord;
  reportGenerator: ResearchReportGenerator;
  repository: ResearchRepository;
  now?: () => string;
}): Promise<ResearchRecord> {
  const now = input.now ?? (() => new Date().toISOString());
  const research = structuredClone(input.research);
  research.status = "running";
  research.stage = "report";
  research.progressMessage = stageMessages.report;
  research.error = undefined;
  await persist(research, input.repository, now);

  try {
    const report = await generateReportWithRetry(research, input.reportGenerator);
    research.reports = [...research.reports, report];
    research.status = "completed";
    research.progressMessage = "报告已重新生成";
  } catch (error) {
    research.status = "failed";
    research.progressMessage = "报告生成失败，已保留现有证据";
    research.error = errorMessage(error);
  }
  await persist(research, input.repository, now);
  return research;
}

export async function excludeResearchEvidence(input: {
  research: ResearchRecord;
  evidenceId: string;
  reason: string;
  repository: ResearchRepository;
  reportGenerator: ResearchReportGenerator;
  now?: () => string;
}): Promise<ResearchRecord> {
  const reason = input.reason.trim();
  if (!reason) {
    throw new Error("Evidence exclusion reason is required");
  }
  const evidence = input.research.evidence.find((item) => item.id === input.evidenceId);
  if (!evidence) {
    throw new Error("Research evidence was not found");
  }
  if (input.research.exclusions.some((item) => item.evidenceId === evidence.id)) {
    return structuredClone(input.research);
  }

  const now = input.now ?? (() => new Date().toISOString());
  const research = structuredClone(input.research);
  research.exclusions = [
    ...research.exclusions,
    {
      evidenceId: evidence.id,
      reason,
      excludedAt: now(),
      actor: "user"
    }
  ];
  const excludedIds = new Set(research.exclusions.map((item) => item.evidenceId));
  const sourceEvidence = research.evidence.filter((item) => item.sourceId === evidence.sourceId);
  if (sourceEvidence.length > 0 && sourceEvidence.every((item) => excludedIds.has(item.id))) {
    research.sources = research.sources.map((source) =>
      source.id === evidence.sourceId ? { ...source, status: "excluded" } : source
    );
  }
  await persist(research, input.repository, now);
  return regenerateResearchReport({ ...input, research, now });
}

async function generateReportWithRetry(
  research: ResearchRecord,
  reportGenerator: ResearchReportGenerator
): Promise<SentimentReportVersion> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const report = await reportGenerator.generate(structuredClone(research));
      validateResearchReport(report, research);
      return structuredClone(report);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Report generation failed");
}

async function persist(
  research: ResearchRecord,
  repository: ResearchRepository,
  now: () => string,
  onProgress?: ResearchProgressCallback
): Promise<void> {
  research.updatedAt = now();
  await repository.saveResearch(research);
  onProgress?.(structuredClone(research));
}

function deduplicateEvidence(evidence: ResearchEvidence[]): ResearchEvidence[] {
  const seenIds = new Set<string>();
  const seenContent = new Set<string>();
  const result: ResearchEvidence[] = [];
  for (const item of evidence) {
    const contentKey = `${item.sourceUrl}\n${normalizeForComparison(item.body)}`;
    if (seenIds.has(item.id) || seenContent.has(contentKey)) {
      continue;
    }
    seenIds.add(item.id);
    seenContent.add(contentKey);
    result.push(item);
  }
  return result;
}

function normalizeForComparison(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Research cancelled", "AbortError");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown research error";
}