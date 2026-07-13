import type { ResearchReportGenerator } from "./contracts.js";
import type {
  ResearchEvidence,
  ResearchRecord,
  ResearchSentiment,
  ResearchTopic,
  SentimentReportVersion
} from "./types.js";

interface TopicDefinition {
  id: string;
  label: string;
  keywords: string[];
}

const topicDefinitions: TopicDefinition[] = [
  {
    id: "stability",
    label: "联机与运行稳定性",
    keywords: [
      "联机",
      "断线",
      "帧率",
      "卡顿",
      "稳定",
      "disconnect",
      "server",
      "lag",
      "performance",
      "stutter",
      "crash"
    ]
  },
  {
    id: "content-cadence",
    label: "内容与更新节奏",
    keywords: ["更新", "补丁", "活动", "内容", "路线图", "update", "patch", "content", "roadmap"]
  },
  {
    id: "core-play",
    label: "核心玩法体验",
    keywords: [
      "战斗",
      "探索",
      "建造",
      "收集",
      "玩法",
      "合作",
      "combat",
      "exploration",
      "building",
      "gameplay",
      "co-op"
    ]
  }
];

export class ReportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReportValidationError";
  }
}

export class DeterministicReportGenerator implements ResearchReportGenerator {
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  async generate(research: ResearchRecord): Promise<SentimentReportVersion> {
    const evidence = activeEvidence(research);
    const rates = calculateSentimentRates(evidence);
    const topics = topicDefinitions
      .map((definition) => buildTopic(definition, evidence))
      .filter((topic): topic is ResearchTopic => topic !== undefined);
    const previous = research.reports.at(-1);
    const version = Math.max(0, ...research.reports.map((report) => report.version)) + 1;
    const report: SentimentReportVersion = {
      id: `report-${research.id}-${version}`,
      version,
      verdict: buildVerdict(evidence.length, rates.positiveRate, rates.negativeRate),
      summary: buildSummary(research, evidence.length, rates, topics),
      ...rates,
      historicalDelta: previous
        ? rates.positiveRate - previous.positiveRate
        : undefined,
      topics,
      strengths: evidence
        .filter((item) => item.sentiment === "positive")
        .slice().sort(compareEvidence)
        .slice(0, 3)
        .map((item) => item.excerpt),
      risks: evidence
        .filter((item) => item.sentiment === "negative")
        .slice().sort(compareEvidence)
        .slice(0, 3)
        .map((item) => item.excerpt),
      controversies: topics
        .filter((topic) => topic.sentiment === "mixed")
        .map((topic) => `${topic.label}的固定样本观点存在明显分歧。`),
      coverage: {
        coveredSources: research.sources.filter((source) => source.status === "covered").length,
        failedSources: research.sources.filter((source) => source.status === "failed").length,
        excludedSources: research.sources.filter((source) => source.status === "excluded").length,
        evidenceCount: evidence.length
      },
      createdAt: this.now()
    };

    validateResearchReport(report, research);
    return report;
  }
}

export function validateResearchReport(
  report: SentimentReportVersion,
  research: ResearchRecord
): void {
  if (!report.verdict.trim() || !report.summary.trim()) {
    throw new ReportValidationError("Report verdict and summary are required");
  }
  if (!Number.isInteger(report.version) || report.version < 1) {
    throw new ReportValidationError("Report version must be a positive integer");
  }
  const excluded = new Set(research.exclusions.map((item) => item.evidenceId));
  const availableIds = new Set(
    research.evidence
      .filter((item) => !excluded.has(item.id))
      .map((item) => item.id)
  );
  const expectedVersion = Math.max(0, ...research.reports.map((item) => item.version)) + 1;
  if (report.version !== expectedVersion) {
    throw new ReportValidationError(`Report version must be ${expectedVersion}`);
  }
  if (report.coverage.evidenceCount !== availableIds.size) {
    throw new ReportValidationError("Report evidence coverage does not match current evidence");
  }
  const rates = [report.positiveRate, report.neutralRate, report.negativeRate];
  if (rates.some((rate) => !Number.isInteger(rate) || rate < 0 || rate > 100)) {
    throw new ReportValidationError("Report sentiment rates must be integer percentages");
  }
  const expectedRateTotal = availableIds.size === 0 ? 0 : 100;
  if (rates.reduce((total, rate) => total + rate, 0) !== expectedRateTotal) {
    throw new ReportValidationError(
      `Report sentiment rates must total ${expectedRateTotal}`
    );
  }
  for (const topic of report.topics) {
    if (topic.evidenceIds.length === 0) {
      throw new ReportValidationError(`Topic ${topic.id} has no evidence citations`);
    }
    for (const evidenceId of topic.evidenceIds) {
      if (!availableIds.has(evidenceId)) {
        throw new ReportValidationError(
          `Topic ${topic.id} cites unavailable evidence ${evidenceId}`
        );
      }
    }
  }
}

function activeEvidence(research: ResearchRecord): ResearchEvidence[] {
  const excluded = new Set(research.exclusions.map((item) => item.evidenceId));
  return research.evidence.filter((item) => !excluded.has(item.id));
}

function calculateSentimentRates(evidence: ResearchEvidence[]): {
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
} {
  if (evidence.length === 0) {
    return { positiveRate: 0, neutralRate: 0, negativeRate: 0 };
  }
  const positive = evidence.filter((item) => item.sentiment === "positive").length;
  const neutral = evidence.filter((item) => item.sentiment === "neutral").length;
  const positiveRate = Math.round((positive / evidence.length) * 100);
  const neutralRate = Math.round((neutral / evidence.length) * 100);
  return {
    positiveRate,
    neutralRate,
    negativeRate: 100 - positiveRate - neutralRate
  };
}

function buildTopic(
  definition: TopicDefinition,
  evidence: ResearchEvidence[]
): ResearchTopic | undefined {
  const matched = evidence.filter((item) => {
    const searchable = `${item.body} ${item.sourceTitle}`.toLowerCase();
    return definition.keywords.some((keyword) => searchable.includes(keyword));
  });
  if (matched.length === 0) {
    return undefined;
  }

  const counts = {
    positive: matched.filter((item) => item.sentiment === "positive").length,
    neutral: matched.filter((item) => item.sentiment === "neutral").length,
    negative: matched.filter((item) => item.sentiment === "negative").length
  };
  const sentiment = topicSentiment(counts);
  return {
    id: definition.id,
    label: definition.label,
    sentiment,
    summary: `${matched.length} 条固定样本涉及${definition.label}，观点${sentimentLabel(sentiment)}。`,
    evidenceIds: matched.slice().sort(compareEvidence).map((item) => item.id)
  };
}

function topicSentiment(counts: Record<Exclude<ResearchSentiment, "mixed">, number>): ResearchSentiment {
  const nonZero = Object.entries(counts).filter(([, count]) => count > 0);
  if (nonZero.length > 1) {
    return "mixed";
  }
  return (nonZero[0]?.[0] as ResearchSentiment | undefined) ?? "neutral";
}

function sentimentLabel(sentiment: ResearchSentiment): string {
  return {
    positive: "整体偏正面",
    neutral: "整体中性",
    negative: "整体偏负面",
    mixed: "存在正负分歧"
  }[sentiment];
}

function buildVerdict(evidenceCount: number, positiveRate: number, negativeRate: number): string {
  if (evidenceCount === 0) {
    return "当前证据不足，暂时无法形成可靠的风评判断。";
  }
  const delta = positiveRate - negativeRate;
  if (delta >= 20) {
    return "固定验证样本中的整体风评偏正面，但仍需结合具体风险判断。";
  }
  if (delta <= -20) {
    return "固定验证样本中的整体风评偏负面，主要风险需要优先核查。";
  }
  return "固定验证样本中的风评较为分化，优势与风险同时存在。";
}

function buildSummary(
  research: ResearchRecord,
  evidenceCount: number,
  rates: { positiveRate: number; neutralRate: number; negativeRate: number },
  topics: ResearchTopic[]
): string {
  if (evidenceCount === 0) {
    return `当前没有可用于分析${research.request.gameName}的固定验证样本，不能生成确定性结论。`;
  }
  const focus = research.request.focus ? `，重点关注“${research.request.focus}”` : "";
  return `本报告使用 ${evidenceCount} 条固定验证样本分析${research.request.gameName}${focus}。样本内正面 ${rates.positiveRate}%、中性 ${rates.neutralRate}%、负面 ${rates.negativeRate}%，归纳出 ${topics.length} 个主要主题；这些比例不代表全体玩家。`;
}

function compareEvidence(left: ResearchEvidence, right: ResearchEvidence): number {
  return right.relevance - left.relevance || right.postedAt.localeCompare(left.postedAt) || left.id.localeCompare(right.id);
}