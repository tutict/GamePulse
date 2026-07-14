import { describe, expect, it } from "vitest";
import { MemoryLocalStore } from "../storage/memoryLocalStore.js";
import { createMobileResearchController } from "./mobileResearchController.js";

const timestamp = "2026-07-13T00:00:00.000Z";

describe("mobile research controller", () => {
  it("runs, refreshes, and persists research without Electron APIs", async () => {
    const store = new MemoryLocalStore();
    await store.initialize();
    const controller = createMobileResearchController(store, {
      now: () => timestamp
    });

    const completed = await controller.start({
      gameName: "幻兽帕鲁",
      focus: "联机稳定性"
    });
    expect(completed.status).toBe("completed");
    expect((await store.listResearches())[0]?.id).toBe(completed.id);

    const refreshed = await controller.refresh(completed.id);
    expect(refreshed.reports.map((report) => report.version)).toEqual([1, 2]);

    const evidenceId = refreshed.evidence[0]!.id;
    const corrected = await controller.excludeEvidence(
      refreshed.id,
      evidenceId,
      "与目标游戏无关"
    );
    expect(corrected.exclusions).toContainEqual(
      expect.objectContaining({ evidenceId })
    );
    expect(corrected.reports.at(-1)?.version).toBe(3);
  });
});