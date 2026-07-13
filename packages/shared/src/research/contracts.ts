import type {
  ResearchEvidence,
  ResearchIdentityCandidate,
  ResearchRecord,
  ResearchRequest,
  ResearchSource,
  SentimentReportVersion
} from "./types.js";

export class ResearchIdentityAmbiguousError extends Error {
  constructor(readonly candidates: ResearchIdentityCandidate[]) {
    super("Game identity is ambiguous");
    this.name = "ResearchIdentityAmbiguousError";
  }
}
export interface ResearchRepository {
  listResearches(): Promise<ResearchRecord[]>;
  getResearch(researchId: string): Promise<ResearchRecord | undefined>;
  saveResearch(research: ResearchRecord): Promise<void>;
}

export interface ResearchCollector {
  collect(
    request: ResearchRequest,
    signal?: AbortSignal
  ): Promise<{
    sources: ResearchSource[];
    evidence: ResearchEvidence[];
  }>;
}

export interface ResearchReportGenerator {
  generate(research: ResearchRecord): Promise<SentimentReportVersion>;
}

export type ResearchProgressCallback = (research: ResearchRecord) => void;
