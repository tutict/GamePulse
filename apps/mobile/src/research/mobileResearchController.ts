import {
  continueResearchWithIdentity,
  createResearch,
  DeterministicReportGenerator,
  excludeResearchEvidence,
  FixtureResearchCollector,
  refreshResearch,
  regenerateResearchReport,
  runResearch,
  type LocalStore,
  type ResearchCollector,
  type ResearchProgressCallback,
  type ResearchRecord,
  type ResearchReportGenerator
} from "@gamepulse/shared";

export interface MobileResearchControllerOptions {
  collector?: ResearchCollector;
  reportGenerator?: ResearchReportGenerator;
  now?: () => string;
}

export function createMobileResearchController(
  store: LocalStore,
  options: MobileResearchControllerOptions = {}
) {
  const collector = options.collector ?? new FixtureResearchCollector();
  const reportGenerator = options.reportGenerator ?? new DeterministicReportGenerator(options.now);
  const now = options.now ?? (() => new Date().toISOString());
  const active = new Map<string, AbortController>();

  async function requireResearch(researchId: string): Promise<ResearchRecord> {
    const research = await store.getResearch(researchId);
    if (!research) {
      throw new Error(`Research not found: ${researchId}`);
    }
    return research;
  }

  async function runCancelable(
    researchId: string,
    operation: (signal: AbortSignal) => Promise<ResearchRecord>
  ): Promise<ResearchRecord> {
    active.get(researchId)?.abort();
    const controller = new AbortController();
    active.set(researchId, controller);
    try {
      return await operation(controller.signal);
    } finally {
      if (active.get(researchId) === controller) {
        active.delete(researchId);
      }
    }
  }

  return {
    list: () => store.listResearches(),
    get: (researchId: string) => store.getResearch(researchId),
    start(
      request: { gameName: string; focus?: string },
      onProgress?: ResearchProgressCallback
    ) {
      const research = createResearch(request, now());
      return runCancelable(research.id, (signal) =>
        runResearch({
          research,
          collector,
          reportGenerator,
          repository: store,
          signal,
          onProgress,
          now
        })
      );
    },
    async continueWithIdentity(
      researchId: string,
      candidateId: string,
      onProgress?: ResearchProgressCallback
    ) {
      const research = await requireResearch(researchId);
      return runCancelable(research.id, (signal) =>
        continueResearchWithIdentity({
          research,
          candidateId,
          collector,
          reportGenerator,
          repository: store,
          signal,
          onProgress,
          now
        })
      );
    },
    async refresh(researchId: string, onProgress?: ResearchProgressCallback) {
      const research = await requireResearch(researchId);
      return runCancelable(research.id, (signal) =>
        refreshResearch({
          research,
          collector,
          reportGenerator,
          repository: store,
          signal,
          onProgress,
          now
        })
      );
    },
    async excludeEvidence(researchId: string, evidenceId: string, reason: string) {
      return excludeResearchEvidence({
        research: await requireResearch(researchId),
        evidenceId,
        reason,
        repository: store,
        reportGenerator,
        now
      });
    },
    async regenerate(researchId: string) {
      return regenerateResearchReport({
        research: await requireResearch(researchId),
        repository: store,
        reportGenerator,
        now
      });
    },
    cancel(researchId: string) {
      const controller = active.get(researchId);
      controller?.abort();
      return { cancelled: Boolean(controller) };
    },
    cancelAll() {
      for (const controller of active.values()) {
        controller.abort();
      }
      active.clear();
    }
  };
}

export type MobileResearchController = ReturnType<typeof createMobileResearchController>;