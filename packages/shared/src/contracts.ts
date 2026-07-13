import type { AnalysisLabel, CommentRecord, IngestItem, Project, Report } from "./domain.js";
import type { RagEvidenceCandidate } from "./rag.js";
import type { ResearchRecord } from "./research/types.js";

export interface LocalStoreStats {
  databasePath?: string;
  projectCount: number;
  commentCount: number;
  latestCollectedAt?: string;
}

export interface LocalStoreWriteResult {
  accepted: number;
  inserted: number;
}

export interface LocalStoreSearchInput {
  projectId: string;
  query: string;
  limit?: number;
}

export interface ProjectSnapshot {
  formatVersion: 1;
  exportedAt: string;
  project: Project;
  comments: CommentRecord[];
  labels: AnalysisLabel[];
  reports: Report[];
}

export interface ProjectMergeResult extends LocalStoreWriteResult {
  projectId: string;
  updated: number;
}

export interface LocalStore {
  initialize(): Promise<void>;
  close(): Promise<void>;
  getStats(projectId?: string): Promise<LocalStoreStats>;
  listProjects(): Promise<Project[]>;
  getProject(projectId: string): Promise<Project | undefined>;
  saveProject(project: Project): Promise<void>;
  listResearches(): Promise<ResearchRecord[]>;
  getResearch(researchId: string): Promise<ResearchRecord | undefined>;
  saveResearch(research: ResearchRecord): Promise<void>;
  ingestComments(projectId: string, items: IngestItem[]): Promise<LocalStoreWriteResult>;
  searchEvidence(input: LocalStoreSearchInput): Promise<RagEvidenceCandidate[]>;
  exportProject(projectId: string): Promise<ProjectSnapshot>;
  importProject(snapshot: ProjectSnapshot): Promise<ProjectMergeResult>;
}

export type ModelMessageRole = "system" | "user" | "assistant";

export interface ModelMessage {
  role: ModelMessageRole;
  content: string;
}

export interface ModelRequest {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export type ModelStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; finishReason?: string }
  | { type: "error"; code: string; message: string; retryable: boolean };

export interface ModelGateway {
  stream(request: ModelRequest): AsyncIterable<ModelStreamEvent>;
}

export interface ProjectPackageCodec {
  encode(snapshot: ProjectSnapshot): Promise<Uint8Array>;
  decode(bytes: Uint8Array): Promise<ProjectSnapshot>;
  decodeStream?(chunks: AsyncIterable<Uint8Array>): Promise<ProjectSnapshot>;
}

export interface PlatformCapabilities {
  platform: "windows" | "android" | "web" | "unknown";
  localSqlite: boolean;
  browserCollection: boolean;
  ollama: boolean;
  secureCredentials: boolean;
  fileImport: boolean;
  fileExport: boolean;
  nativeShare: boolean;
}
