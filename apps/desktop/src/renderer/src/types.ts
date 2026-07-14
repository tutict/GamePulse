import type {
  ModelMessage,
  ModelStreamEvent,
  Project,
  ProjectMergeResult,
  ResearchRecord
} from "@gamepulse/shared";

export interface CollectorItem {
  body: string;
  platform: string;
  sourceUrl: string;
  sourceTitle: string;
  selector: string;
}

export interface CollectorResult {
  url: string;
  title: string;
  platform: string;
  itemCount: number;
  items: CollectorItem[];
}

export interface SaveCollectorResult {
  accepted: number;
  inserted: number;
  databasePath: string;
  totalItems: number;
}

export interface DatabaseStats {
  databasePath: string;
  projectCount: number;
  rawItemCount: number;
  latestCollectedAt?: string;
}

export interface RagEvidence {
  id: string;
  platform: string;
  sourceUrl?: string;
  sourceTitle?: string;
  body: string;
  excerpt: string;
  collectedAt: string;
  score: number;
}

export interface RagQueryResult {
  query: string;
  answer: string;
  prompt: string;
  evidence: RagEvidence[];
  contextCharacterCount: number;
}

export interface ModelConfigStatus {
  provider: "openai" | "ollama";
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyHint?: string;
}

export interface ModelConfigInput {
  provider: "openai" | "ollama";
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ModelEventEnvelope {
  requestId: string;
  event: ModelStreamEvent;
}

export type ProjectPackageExportResult =
  | { canceled: true }
  | {
      canceled: false;
      filePath: string;
      fileName: string;
      projectId: string;
      bytes: number;
    };

export type ProjectPackageImportResult =
  | { canceled: true }
  | ({
      canceled: false;
      filePath: string;
      fileName: string;
    } & ProjectMergeResult);

export interface GamePulseBridge {
  platform: string;
  versions: {
    chrome?: string;
    electron?: string;
    node?: string;
  };
  collector: {
    captureVisible(url: string): Promise<CollectorResult>;
  };
  database: {
    getStats(): Promise<DatabaseStats>;
    saveCollectorResult(result: CollectorResult): Promise<SaveCollectorResult>;
  };
  projects: {
    list(): Promise<Project[]>;
    exportPackage(projectId: string): Promise<ProjectPackageExportResult>;
    importPackage(): Promise<ProjectPackageImportResult>;
  };
  rag: {
    query(input: { query: string; limit?: number; projectId?: string }): Promise<RagQueryResult>;
  };
  research: {
    list(): Promise<ResearchRecord[]>;
    get(researchId: string): Promise<ResearchRecord | undefined>;
    start(request: { gameName: string; focus?: string }): Promise<ResearchRecord>;
    cancel(researchId: string): Promise<{ cancelled: boolean }>;
    continueIdentity(researchId: string, candidateId: string): Promise<ResearchRecord>;
    refresh(researchId: string): Promise<ResearchRecord>;
    excludeEvidence(
      researchId: string,
      evidenceId: string,
      reason: string
    ): Promise<ResearchRecord>;
    regenerate(researchId: string): Promise<ResearchRecord>;
    onEvent(callback: (record: ResearchRecord) => void): () => void;
  };  models: {
    getStatus(): Promise<ModelConfigStatus>;
    updateConfig(input: ModelConfigInput): Promise<ModelConfigStatus>;
    start(input: {
      requestId: string;
      messages: ModelMessage[];
      timeoutMs?: number;
      temperature?: number;
    }): Promise<{ completed: boolean }>;
    cancel(requestId: string): Promise<{ cancelled: boolean }>;
    onEvent(callback: (event: ModelEventEnvelope) => void): () => void;
  };
}

declare global {
  interface Window {
    gamepulse: GamePulseBridge;
  }
}
