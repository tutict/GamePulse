import type { ResearchRepository } from "./contracts.js";
import type { ResearchRecord } from "./types.js";

export class MemoryResearchRepository implements ResearchRepository {
  private readonly researches = new Map<string, ResearchRecord>();

  async listResearches(): Promise<ResearchRecord[]> {
    return Array.from(this.researches.values(), (research) =>
      structuredClone(research)
    ).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getResearch(researchId: string): Promise<ResearchRecord | undefined> {
    const research = this.researches.get(researchId);
    return research === undefined ? undefined : structuredClone(research);
  }

  async saveResearch(research: ResearchRecord): Promise<void> {
    this.researches.set(research.id, structuredClone(research));
  }
}
