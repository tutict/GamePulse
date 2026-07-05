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
  rag: {
    query(input: { query: string; limit?: number }): Promise<RagQueryResult>;
  };
}

declare global {
  interface Window {
    gamepulse: GamePulseBridge;
  }
}