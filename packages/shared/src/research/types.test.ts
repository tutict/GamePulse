import { describe, expect, it } from "vitest";
import { MemoryResearchRepository } from "./memoryRepository.js";
import { createResearch } from "./types.js";

describe("research aggregate", () => {
  it("normalizes a request into a pending 90-day research record", () => {
    const research = createResearch(
      {
        gameName: "  幻兽帕鲁  ",
        focus: "  联机稳定性  ",
        identityId: "  app-1623730  "
      },
      "2026-07-13T00:00:00.000Z",
      "research-1"
    );

    expect(research).toMatchObject({
      id: "research-1",
      request: {
        gameName: "幻兽帕鲁",
        focus: "联机稳定性",
        periodDays: 90,
        identityId: "app-1623730"
      },
      status: "pending",
      sources: [],
      evidence: [],
      reports: [],
      exclusions: [],
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T00:00:00.000Z"
    });
  });

  it("rejects a blank game name", () => {
    expect(() => {
      createResearch(
        { gameName: "   " },
        "2026-07-13T00:00:00.000Z",
        "research-1"
      );
    }).toThrowError(new Error("Game name is required"));
  });

  it("creates fresh aggregate arrays for each research", () => {
    const first = createResearch(
      { gameName: "First" },
      "2026-07-13T00:00:00.000Z",
      "research-1"
    );
    const second = createResearch(
      { gameName: "Second" },
      "2026-07-13T00:00:00.000Z",
      "research-2"
    );

    expect(first.sources).not.toBe(second.sources);
    expect(first.evidence).not.toBe(second.evidence);
    expect(first.exclusions).not.toBe(second.exclusions);
    expect(first.reports).not.toBe(second.reports);
  });
});

describe("memory research repository", () => {
  it("does not leak mutable references through saves or reads", async () => {
    const repository = new MemoryResearchRepository();
    const research = createResearch(
      { gameName: "幻兽帕鲁" },
      "2026-07-13T00:00:00.000Z",
      "research-1"
    );

    await repository.saveResearch(research);
    research.request.gameName = "mutated after save";

    const firstRead = await repository.getResearch("research-1");
    expect(firstRead?.request.gameName).toBe("幻兽帕鲁");

    firstRead!.request.gameName = "mutated after get";
    firstRead!.sources.push({
      id: "source-1",
      platform: "steam",
      title: "source",
      url: "https://example.com/source",
      status: "covered",
      itemCount: 1
    });

    const listed = await repository.listResearches();
    expect(listed[0]?.request.gameName).toBe("幻兽帕鲁");
    expect(listed[0]?.sources).toEqual([]);

    listed[0]!.request.gameName = "mutated after list";
    expect((await repository.getResearch("research-1"))?.request.gameName).toBe(
      "幻兽帕鲁"
    );
  });

  it("lists research records by most recent update", async () => {
    const repository = new MemoryResearchRepository();
    const older = createResearch(
      { gameName: "Older" },
      "2026-07-12T00:00:00.000Z",
      "research-older"
    );
    const newer = createResearch(
      { gameName: "Newer" },
      "2026-07-13T00:00:00.000Z",
      "research-newer"
    );

    await repository.saveResearch(older);
    await repository.saveResearch(newer);

    expect((await repository.listResearches()).map(({ id }) => id)).toEqual([
      "research-newer",
      "research-older"
    ]);
  });
});
