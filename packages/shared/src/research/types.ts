export type ResearchStatus =
  | "pending"
  | "running"
  | "needs_input"
  | "completed"
  | "failed"
  | "cancelled";

export type ResearchStage =
  | "identity"
  | "discovery"
  | "collection"
  | "cleaning"
  | "report";

export type ResearchSentiment = "positive" | "neutral" | "negative" | "mixed";

export interface ResearchRequest {
  gameName: string;
  focus?: string;
  periodDays: number;
  identityId?: string;
}

export interface ResearchSource {
  id: string;
  platform: string;
  title: string;
  url: string;
  status: "covered" | "failed" | "excluded";
  itemCount: number;
  error?: string;
}

export interface ResearchEvidence {
  id: string;
  sourceId: string;
  platform: string;
  sourceUrl: string;
  sourceTitle: string;
  body: string;
  excerpt: string;
  postedAt: string;
  dateEstimated?: boolean;
  sentiment: Exclude<ResearchSentiment, "mixed">;
  relevance: number;
}

export interface EvidenceExclusion {
  evidenceId: string;
  reason: string;
  excludedAt: string;
  actor: "agent" | "user";
}

export interface ResearchTopic {
  id: string;
  label: string;
  sentiment: ResearchSentiment;
  summary: string;
  evidenceIds: string[];
}

export interface ResearchCoverage {
  coveredSources: number;
  failedSources: number;
  excludedSources: number;
  evidenceCount: number;
}

export interface SentimentReportVersion {
  id: string;
  version: number;
  verdict: string;
  summary: string;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  historicalDelta?: number;
  topics: ResearchTopic[];
  strengths: string[];
  risks: string[];
  controversies: string[];
  coverage: ResearchCoverage;
  createdAt: string;
}

export interface ResearchIdentityCandidate {
  id: string;
  name: string;
  platform?: string;
  url?: string;
}

export interface ResearchRecord {
  id: string;
  request: ResearchRequest;
  status: ResearchStatus;
  stage?: ResearchStage;
  progressMessage?: string;
  sources: ResearchSource[];
  evidence: ResearchEvidence[];
  exclusions: EvidenceExclusion[];
  reports: SentimentReportVersion[];
  identityCandidates?: ResearchIdentityCandidate[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export function createResearch(
  request: { gameName: string; focus?: string; identityId?: string },
  now = new Date().toISOString(),
  id = globalThis.crypto.randomUUID()
): ResearchRecord {
  const gameName = request.gameName.trim();
  if (!gameName) {
    throw new Error("Game name is required");
  }

  const focus = request.focus?.trim() || undefined;
  const identityId = request.identityId?.trim() || undefined;

  return {
    id,
    request: { gameName, focus, periodDays: 90, identityId },
    status: "pending",
    sources: [],
    evidence: [],
    exclusions: [],
    reports: [],
    createdAt: now,
    updatedAt: now
  };
}

export function compareResearchEvidence(
  left: ResearchEvidence,
  right: ResearchEvidence
): number {
  return right.relevance - left.relevance || left.id.localeCompare(right.id);
}
