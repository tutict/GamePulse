import { describe, expect, it } from "vitest";
import type { ResearchReportGenerator } from "./contracts.js";
import { FixtureResearchCollector } from "./fixtureCollector.js";
import { buildResearchFollowUp } from "./followUp.js";
import { MemoryResearchRepository } from "./memoryRepository.js";
import {
  continueResearchWithIdentity,
  excludeResearchEvidence,
  refreshResearch,
  runResearch
} from "./orchestrator.js";
import { DeterministicReportGenerator } from "./reportGenerator.js";
import {
  compareResearchEvidence,
  createResearch,
  type ResearchRecord
} from "./types.js";

const timestamp = "2026-07-13T00:00:00.000Z";
const now = () => timestamp;

function generator(): DeterministicReportGenerator {
  return new DeterministicReportGenerator(now);
}

describe("research orchestration", () => {
  it("persists stage progress and completes with cited fixture evidence", async () => {
    const repository = new MemoryResearchRepository();
    const stages: Array<ResearchRecord["stage"]> = [];
    const completed = await runResearch({
      research: createResearch(
        { gameName: "幻兽帕鲁", focus: "联机稳定性" },
        timestamp,
        "research-1"
      ),
      collector: new FixtureResearchCollector(),
      reportGenerator: generator(),
      repository,
      now,
      onProgress: (research) => stages.push(research.stage)
    });

    expect(completed.status).toBe("completed");
    expect(stages.filter((stage, index) => stage !== stages[index - 1])).toEqual([
      "identity",
      "discovery",
      "collection",
      "cleaning",
      "report"
    ]);
    expect(completed.sources.some((source) => source.status === "failed")).toBe(true);
    expect(new Set(completed.evidence.map((item) => item.platform))).toEqual(
      new Set(["steam", "bilibili", "reddit", "public-forum"])
    );
    expect(completed.reports[0]?.topics.length).toBeGreaterThanOrEqual(3);
    expect(
      completed.reports[0]?.topics.every((topic) => topic.evidenceIds.length > 0)
    ).toBe(true);
    expect(await repository.getResearch("research-1")).toEqual(completed);
  });

  it("does not expose mutable progress records", async () => {
    const repository = new MemoryResearchRepository();
    const completed = await runResearch({
      research: createResearch({ gameName: "测试游戏" }, timestamp, "research-2"),
      collector: new FixtureResearchCollector(),
      reportGenerator: generator(),
      repository,
      now,
      onProgress: (research) => {
        research.request.gameName = "被回调修改";
        research.evidence.splice(0);
      }
    });

    expect(completed.request.gameName).toBe("测试游戏");
    expect(completed.evidence.length).toBeGreaterThanOrEqual(6);
    expect((await repository.getResearch("research-2"))?.request.gameName).toBe(
      "测试游戏"
    );
  });

  it("marks a pre-cancelled run without creating a report", async () => {
    const controller = new AbortController();
    controller.abort();

    const cancelled = await runResearch({
      research: createResearch({ gameName: "测试游戏" }, timestamp, "research-3"),
      collector: new FixtureResearchCollector(),
      reportGenerator: generator(),
      repository: new MemoryResearchRepository(),
      signal: controller.signal,
      now
    });

    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.reports).toEqual([]);
  });

  it("pauses for an ambiguous identity and resumes after a candidate is chosen", async () => {
    const repository = new MemoryResearchRepository();
    const collector = new FixtureResearchCollector();
    const paused = await runResearch({
      research: createResearch({ gameName: "同名游戏" }, timestamp, "research-4"),
      collector,
      reportGenerator: generator(),
      repository,
      now
    });

    expect(paused.status).toBe("needs_input");
    expect(paused.stage).toBe("identity");
    expect(paused.identityCandidates).toHaveLength(2);

    const completed = await continueResearchWithIdentity({
      research: paused,
      candidateId: paused.identityCandidates![0]!.id,
      collector,
      reportGenerator: generator(),
      repository,
      now
    });

    expect(completed.status).toBe("completed");
    expect(completed.request.identityId).toBe(paused.identityCandidates![0]!.id);
    expect(completed.identityCandidates).toBeUndefined();
  });

  it("accepts a valid report when the automatic retry repairs invalid citations", async () => {
    let attempts = 0;
    const validGenerator = generator();
    const retryingGenerator: ResearchReportGenerator = {
      async generate(research) {
        attempts += 1;
        const report = await validGenerator.generate(research);
        if (attempts === 1) {
          report.topics[0] = { ...report.topics[0]!, evidenceIds: [] };
        }
        return report;
      }
    };

    const completed = await runResearch({
      research: createResearch({ gameName: "测试游戏" }, timestamp, "research-retry"),
      collector: new FixtureResearchCollector(),
      reportGenerator: retryingGenerator,
      repository: new MemoryResearchRepository(),
      now
    });

    expect(attempts).toBe(2);
    expect(completed.status).toBe("completed");
    expect(completed.reports).toHaveLength(1);
  });
  it("retries report generation once and preserves evidence after a second failure", async () => {
    let attempts = 0;
    const failingGenerator: ResearchReportGenerator = {
      async generate() {
        attempts += 1;
        throw new Error("invalid report output");
      }
    };

    const failed = await runResearch({
      research: createResearch({ gameName: "测试游戏" }, timestamp, "research-5"),
      collector: new FixtureResearchCollector(),
      reportGenerator: failingGenerator,
      repository: new MemoryResearchRepository(),
      now
    });

    expect(attempts).toBe(2);
    expect(failed.status).toBe("failed");
    expect(failed.stage).toBe("report");
    expect(failed.evidence.length).toBeGreaterThanOrEqual(6);
    expect(failed.reports).toEqual([]);
    expect(failed.error).toContain("invalid report output");
  });

  it("creates immutable report versions for refreshes and exclusions", async () => {
    const repository = new MemoryResearchRepository();
    const collector = new FixtureResearchCollector();
    const first = await runResearch({
      research: createResearch({ gameName: "幻兽帕鲁" }, timestamp, "research-6"),
      collector,
      reportGenerator: generator(),
      repository,
      now
    });
    const originalBody = first.evidence[0]!.body;

    const refreshed = await refreshResearch({
      research: first,
      collector,
      reportGenerator: generator(),
      repository,
      now
    });
    expect(refreshed.reports.map((report) => report.version)).toEqual([1, 2]);
    expect(refreshed.reports[1]?.historicalDelta).toBe(0);

    const excludedId = refreshed.evidence[0]!.id;
    const corrected = await excludeResearchEvidence({
      research: refreshed,
      evidenceId: excludedId,
      reason: "与目标游戏无关",
      reportGenerator: generator(),
      repository,
      now
    });

    expect(corrected.reports.map((report) => report.version)).toEqual([1, 2, 3]);
    expect(corrected.exclusions).toContainEqual(
      expect.objectContaining({ evidenceId: excludedId, actor: "user" })
    );
    expect(
      corrected.reports.at(-1)?.topics.flatMap((topic) => topic.evidenceIds)
    ).not.toContain(excludedId);
    expect(corrected.evidence[0]?.body).toBe(originalBody);
  });
});

describe("research follow-up", () => {
  it("uses only current non-excluded evidence within source and context limits", () => {
    const research = createResearch({ gameName: "测试游戏" }, timestamp, "research-7");
    research.status = "completed";
    research.evidence = Array.from({ length: 15 }, (_, index) => ({
      id: `evidence-${index}`,
      sourceId: `source-${index % 4}`,
      platform: index % 2 === 0 ? "steam" : "reddit",
      sourceUrl: `https://fixtures.gamepulse.local/source-${index % 4}`,
      sourceTitle: `测试游戏固定样本来源 ${index % 4}`,
      body: `联机稳定性讨论 ${index} ${"内容".repeat(1200)}`,
      excerpt: `联机稳定性讨论 ${index}`,
      postedAt: `2026-07-${String(13 - (index % 9)).padStart(2, "0")}T00:00:00.000Z`,
      sentiment: index % 3 === 0 ? "negative" : "positive",
      relevance: 100 - index
    }));
    research.exclusions = [
      {
        evidenceId: "evidence-0",
        reason: "错误样本",
        excludedAt: timestamp,
        actor: "user"
      }
    ];

    const result = buildResearchFollowUp({
      research,
      question: "联机稳定性怎么样？"
    });

    expect(result.citations.length).toBeLessThanOrEqual(8);
    expect(result.context.length).toBeLessThanOrEqual(12_000);
    expect(result.citations.map((item) => item.evidenceId)).not.toContain("evidence-0");
    const stableLabels = new Map(
      research.evidence
        .filter((item) => item.id !== "evidence-0")
        .sort(compareResearchEvidence)
        .map((item, index) => [item.id, `[E${index + 1}]`])
    );
    expect(result.citations.map((item) => item.label)).toEqual(
      result.citations.map((item) => stableLabels.get(item.evidenceId))
    );
    const perSource = Map.groupBy(result.citations, (item) => item.sourceId);
    expect(Array.from(perSource.values()).every((items) => items.length <= 2)).toBe(true);
    expect(result.prompt).toContain("只依据以下当前研究证据");
    expect(result.fallbackAnswer).toContain("[E1]");
  });

  it("returns an explicit grounded fallback when no evidence is available", () => {
    const result = buildResearchFollowUp({
      research: createResearch({ gameName: "测试游戏" }, timestamp, "research-8"),
      question: "值得买吗？"
    });

    expect(result.citations).toEqual([]);
    expect(result.fallbackAnswer).toBe(
      "当前研究没有可用证据，无法基于本地材料回答这个问题。"
    );
  });

  it("does not match English topic keywords inside a game name", async () => {
    const research = createResearch({ gameName: "Palworld" }, timestamp, "research-9");
    research.sources = [{
      id: "source-1",
      platform: "reddit",
      title: "Palworld player reviews",
      url: "https://www.reddit.com/r/Palworld",
      status: "covered",
      itemCount: 1
    }];
    research.evidence = [{
      id: "evidence-1",
      sourceId: "source-1",
      platform: "reddit",
      sourceUrl: "https://www.reddit.com/r/Palworld",
      sourceTitle: "Palworld player reviews",
      body: "The combat is fun and stable.",
      excerpt: "The combat is fun and stable.",
      postedAt: timestamp,
      sentiment: "positive",
      relevance: 0.9
    }];

    const report = await generator().generate(research);

    expect(report.topics.map((topic) => topic.id)).toContain("core-play");
    expect(report.topics.map((topic) => topic.id)).not.toContain("story-world");
  });
});
