export const PLATFORMS = [
  "bilibili",
  "steam",
  "nga",
  "reddit",
  "taptap",
  "heybox",
  "import"
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  bilibili: "B站",
  steam: "Steam",
  nga: "NGA",
  reddit: "Reddit",
  taptap: "TapTap",
  heybox: "小黑盒",
  import: "导入"
};

export const ENTITY_KINDS = ["character", "version", "system", "mode"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type Intent = "praise" | "complaint" | "bug_report" | "question" | "suggestion" | "churn_signal" | "other";
export type Topic =
  | "performance"
  | "crash"
  | "balance"
  | "monetization"
  | "content"
  | "matchmaking"
  | "story"
  | "character"
  | "event"
  | "account"
  | "community"
  | "other";

export interface EntityAlias {
  kind: EntityKind;
  canonical: string;
  aliases: string[];
}

export interface SourceLink {
  platform: Platform;
  url: string;
  label?: string;
}

export interface VersionWindow {
  id: string;
  name: string;
  releasedAt: string;
  beforeDays: number;
  afterDays: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  steamAppId?: string;
  redditSubreddits: string[];
  redditKeywords: string[];
  sourceLinks: SourceLink[];
  versionWindows: VersionWindow[];
  entityAliases: EntityAlias[];
  createdAt: string;
  updatedAt: string;
}

export interface IngestItem {
  platform: Platform;
  body: string;
  sourceUrl?: string;
  sourceTitle?: string;
  externalId?: string;
  authorName?: string;
  authorId?: string;
  authorProfileUrl?: string;
  postedAt?: string;
  language?: string;
  upvotes?: number;
  replies?: number;
  metadata?: Record<string, unknown>;
}

export interface CommentRecord extends IngestItem {
  id: string;
  projectId: string;
  bodyNorm: string;
  authorHash?: string;
  contentHash: string;
  collectedAt: string;
}

export interface MatchedEntity {
  kind: EntityKind;
  canonical: string;
  matchedAliases: string[];
}

export interface AnalysisLabel {
  commentId: string;
  sentiment: Sentiment;
  topic: Topic;
  intent: Intent;
  severity: number;
  isBug: boolean;
  isChurnRisk: boolean;
  entities: MatchedEntity[];
  confidence: number;
  rationale: string;
  model: string;
}

export interface EvidenceRef {
  commentId: string;
  platform: Platform;
  sourceUrl?: string;
  postedAt?: string;
  excerpt: string;
  sentiment?: Sentiment;
  severity?: number;
}

export interface TopicCluster {
  id: string;
  projectId: string;
  runId: string;
  kind: "complaint" | "bug" | "praise" | "risk" | "entity";
  label: string;
  itemCount: number;
  sentiment: Sentiment;
  severity: number;
  summary: string;
  recommendation: string;
  evidence: EvidenceRef[];
  createdAt: string;
}

export interface RiskSignal {
  label: string;
  count: number;
  severity: number;
  evidence: EvidenceRef[];
}

export interface ReportSummary {
  totalComments: number;
  negativeRate: number;
  bugRate: number;
  churnRiskRate: number;
  riskIndex: number;
  topComplaints: TopicCluster[];
  topBugs: TopicCluster[];
  entityHeat: Array<{ kind: EntityKind; canonical: string; count: number; negativeRate: number }>;
}

export interface Report {
  id: string;
  runId: string;
  projectId: string;
  title: string;
  periodStart?: string;
  periodEnd?: string;
  markdown: string;
  summary: ReportSummary;
  createdAt: string;
}

export interface AnalysisRunInput {
  projectId: string;
  versionWindowId?: string;
  periodStart?: string;
  periodEnd?: string;
  sampleLimit?: number;
}

export interface AnalysisRun {
  id: string;
  projectId: string;
  status: "queued" | "processing" | "completed" | "failed";
  input: AnalysisRunInput;
  progress: {
    processed: number;
    total: number;
    stage: string;
  };
  reportId?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

