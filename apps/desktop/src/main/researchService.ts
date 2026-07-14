import {
  continueResearchWithIdentity,
  createResearch,
  excludeResearchEvidence,
  refreshResearch,
  regenerateResearchReport,
  runResearch,
  type ResearchCollector,
  type ResearchProgressCallback,
  type ResearchRecord,
  type ResearchReportGenerator,
  type ResearchRepository
} from "@gamepulse/shared";

export interface DesktopResearchServiceDependencies {
  repository: ResearchRepository;
  collector: ResearchCollector;
  reportGenerator: ResearchReportGenerator;
  now?: () => string;
}

export class DesktopResearchService {
  private readonly active = new Map<string, AbortController>();
  private readonly now: () => string;

  constructor(private readonly dependencies: DesktopResearchServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date().toISOString());
  }

  list(): Promise<ResearchRecord[]> {
    return this.dependencies.repository.listResearches();
  }

  get(researchId: string): Promise<ResearchRecord | undefined> {
    return this.dependencies.repository.getResearch(researchId);
  }

  async start(
    request: { gameName: string; focus?: string },
    onProgress?: ResearchProgressCallback
  ): Promise<ResearchRecord> {
    const research = createResearch(request, this.now());
    return this.runCancelable(research.id, (signal) =>
      runResearch({
        research,
        collector: this.dependencies.collector,
        reportGenerator: this.dependencies.reportGenerator,
        repository: this.dependencies.repository,
        signal,
        onProgress,
        now: this.now
      })
    );
  }

  async continueWithIdentity(
    researchId: string,
    candidateId: string,
    onProgress?: ResearchProgressCallback
  ): Promise<ResearchRecord> {
    const research = await this.requireResearch(researchId);
    return this.runCancelable(research.id, (signal) =>
      continueResearchWithIdentity({
        research,
        candidateId,
        collector: this.dependencies.collector,
        reportGenerator: this.dependencies.reportGenerator,
        repository: this.dependencies.repository,
        signal,
        onProgress,
        now: this.now
      })
    );
  }

  async refresh(
    researchId: string,
    onProgress?: ResearchProgressCallback
  ): Promise<ResearchRecord> {
    const research = await this.requireResearch(researchId);
    return this.runCancelable(research.id, (signal) =>
      refreshResearch({
        research,
        collector: this.dependencies.collector,
        reportGenerator: this.dependencies.reportGenerator,
        repository: this.dependencies.repository,
        signal,
        onProgress,
        now: this.now
      })
    );
  }

  async excludeEvidence(
    researchId: string,
    evidenceId: string,
    reason: string
  ): Promise<ResearchRecord> {
    return excludeResearchEvidence({
      research: await this.requireResearch(researchId),
      evidenceId,
      reason,
      repository: this.dependencies.repository,
      reportGenerator: this.dependencies.reportGenerator,
      now: this.now
    });
  }

  async regenerate(researchId: string): Promise<ResearchRecord> {
    return regenerateResearchReport({
      research: await this.requireResearch(researchId),
      repository: this.dependencies.repository,
      reportGenerator: this.dependencies.reportGenerator,
      now: this.now
    });
  }

  cancel(researchId: string): { cancelled: boolean } {
    const controller = this.active.get(researchId);
    controller?.abort();
    return { cancelled: Boolean(controller) };
  }

  cancelAll(): void {
    for (const controller of this.active.values()) {
      controller.abort();
    }
    this.active.clear();
  }

  private async requireResearch(researchId: string): Promise<ResearchRecord> {
    const research = await this.get(researchId);
    if (!research) {
      throw new Error(`Research not found: ${researchId}`);
    }
    return research;
  }

  private async runCancelable(
    researchId: string,
    operation: (signal: AbortSignal) => Promise<ResearchRecord>
  ): Promise<ResearchRecord> {
    this.active.get(researchId)?.abort();
    const controller = new AbortController();
    this.active.set(researchId, controller);
    try {
      return await operation(controller.signal);
    } finally {
      if (this.active.get(researchId) === controller) {
        this.active.delete(researchId);
      }
    }
  }
}