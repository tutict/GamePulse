import { describe, expect, it } from "vitest";
import {
  DeterministicReportGenerator,
  FixtureResearchCollector,
  MemoryResearchRepository
} from "@gamepulse/shared";
import { DesktopResearchService } from "./researchService.js";

const timestamp = "2026-07-13T00:00:00.000Z";

describe("DesktopResearchService", () => {
  it("starts, lists, refreshes, and excludes evidence without Electron APIs", async () => {
    const service = new DesktopResearchService({
      repository: new MemoryResearchRepository(),
      collector: new FixtureResearchCollector(),
      reportGenerator: new DeterministicReportGenerator(() => timestamp),
      now: () => timestamp
    });
    const events: string[] = [];

    const completed = await service.start(
      { gameName: "幻兽帕鲁", focus: "联机" },
      (event) => events.push(event.stage ?? event.status)
    );

    expect(completed.status).toBe("completed");
    expect(events).toContain("collection");
    expect(await service.list()).toHaveLength(1);
    expect(await service.get(completed.id)).toEqual(completed);

    const refreshed = await service.refresh(completed.id);
    expect(refreshed.reports.map((report) => report.version)).toEqual([1, 2]);

    const evidenceId = refreshed.evidence[0]!.id;
    const corrected = await service.excludeEvidence(
      refreshed.id,
      evidenceId,
      "与目标游戏无关"
    );
    expect(corrected.exclusions).toContainEqual(
      expect.objectContaining({ evidenceId })
    );
    expect(corrected.reports.at(-1)?.version).toBe(3);
  });

  it("resumes an ambiguous game identity and reports cancellation state", async () => {
    const service = new DesktopResearchService({
      repository: new MemoryResearchRepository(),
      collector: new FixtureResearchCollector(),
      reportGenerator: new DeterministicReportGenerator(() => timestamp),
      now: () => timestamp
    });
    const paused = await service.start({ gameName: "同名游戏" });
    expect(paused.status).toBe("needs_input");

    const completed = await service.continueWithIdentity(
      paused.id,
      paused.identityCandidates![0]!.id
    );
    expect(completed.status).toBe("completed");
    expect(service.cancel("missing-research")).toEqual({ cancelled: false });
  });
});