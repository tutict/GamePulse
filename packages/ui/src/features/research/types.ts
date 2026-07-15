export type ResearchSentimentView = "positive" | "neutral" | "negative" | "mixed";
export type ResearchStageId = "identity" | "discovery" | "collection" | "cleaning" | "report";

export interface ResearchHistoryItem {
  id: string;
  gameName: string;
  focus?: string;
  status: "pending" | "running" | "needs_input" | "completed" | "failed" | "cancelled";
  updatedAt: string;
  reportVersion?: number;
  verdict?: string;
  positiveRate?: number;
  historicalDelta?: number;
}

export interface ResearchStageView {
  id: ResearchStageId;
  message: string;
  status: "running" | "needs_input" | "failed" | "cancelled";
  evidenceCount: number;
}

export interface SourceStatusView {
  id: string;
  platform: string;
  title: string;
  status: "covered" | "failed" | "excluded";
  itemCount: number;
  error?: string;
}

export interface IdentityCandidateView {
  id: string;
  name: string;
  platform?: string;
}

export interface TopicView {
  id: string;
  label: string;
  sentiment: ResearchSentimentView;
  summary: string;
  evidenceIds: string[];
}

export interface SentimentReportView {
  researchId: string;
  gameName: string;
  focus?: string;
  version: number;
  updatedAt: string;
  verdict: string;
  summary: string;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  historicalDelta?: number;
  topics: TopicView[];
  strengths: string[];
  risks: string[];
  controversies: string[];
  coverage: {
    coveredSources: number;
    failedSources: number;
    excludedSources: number;
    evidenceCount: number;
  };
}

export interface EvidenceView {
  id: string;
  sourceId: string;
  citationLabel: string;
  platform: string;
  sourceTitle: string;
  sourceUrl: string;
  excerpt: string;
  body: string;
  postedAt: string;
  dateEstimated?: boolean;
  sentiment: Exclude<ResearchSentimentView, "mixed">;
  relevance: number;
  excluded?: boolean;
  fixture?: boolean;
}

export interface ResearchSettingsView {
  platform: "windows" | "android";
  mode: "fixture" | "live";
  provider: "openai" | "ollama";
  baseUrl: string;
  model: string;
  apiKeyHint?: string;
  credentialsReady: boolean;
  supportsOllama: boolean;
  busy?: boolean;
  message?: string;
  advancedData?: {
    importEnabled: boolean;
    exportEnabled: boolean;
    status?: string;
  };
}

export interface ResearchSettingsInput {
  provider: "openai" | "ollama";
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export type ResearchWorkspaceModel =
  | {
      screen: "start";
      recent: ResearchHistoryItem[];
      mode: "fixture" | "live";
      credentialsReady: boolean;
      busy?: boolean;
      error?: string;
    }
  | {
      screen: "progress";
      gameName: string;
      focus?: string;
      stage: ResearchStageView;
      sources: SourceStatusView[];
      canCancel: boolean;
      identityCandidates?: IdentityCandidateView[];
      error?: string;
      canRegenerate?: boolean;
    }
  | {
      screen: "report";
      report: SentimentReportView;
      evidence: EvidenceView[];
      followUpAnswer?: string;
      followUpBusy?: boolean;
      busy?: boolean;
    }
  | { screen: "history"; items: ResearchHistoryItem[] }
  | { screen: "settings"; settings: ResearchSettingsView };

export interface ResearchWorkspaceProps {
  model: ResearchWorkspaceModel;
  onNavigate?: (view: "research" | "history" | "settings") => void;
  onStart?: (request: { gameName: string; focus?: string }) => void;
  onCancel?: () => void;
  onChooseIdentity?: (candidateId: string) => void;
  onOpenResearch?: (researchId: string) => void;
  onUpdateResearch?: () => void;
  onRegenerateReport?: () => void;
  onAskFollowUp?: (question: string) => void;
  onExcludeEvidence?: (evidenceId: string, reason: string) => void;
  onSaveSettings?: (settings: ResearchSettingsInput) => void;
  onImportData?: () => void;
  onExportData?: () => void;
}
