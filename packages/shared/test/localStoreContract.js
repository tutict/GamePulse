import { describe, expect, it } from "vitest";

export function runLocalStoreContract(name, createStore) {
  describe(`${name} LocalStore contract`, () => {
    it("persists projects, deduplicates comments, searches evidence, and merges snapshots", async () => {
      const source = await createStore();
      const destination = await createStore();
      const project = sampleProject();
      await source.saveProject(project);

      const research = sampleResearch();
      await source.saveResearch(research);

      const first = await source.ingestComments(project.id, [
        {
          platform: "steam",
          body: "Performance stutters after the latest update.",
          sourceUrl: "https://example.test/review/1"
        },
        {
          platform: "steam",
          body: "Performance stutters after the latest update.",
          sourceUrl: "https://example.test/review/1"
        },
        {
          platform: "bilibili",
          body: "新版本战斗时明显卡顿。",
          sourceUrl: "https://example.test/video/2"
        }
      ]);
      const search = await source.searchEvidence({
        projectId: project.id,
        query: "performance 卡顿",
        limit: 10
      });
      const snapshot = await source.exportProject(project.id);
      const imported = await destination.importProject(snapshot);
      const duplicate = await destination.importProject(snapshot);

      expect(first).toEqual({ accepted: 3, inserted: 2 });
      expect(search.map((item) => item.body)).toEqual(expect.arrayContaining([
        expect.stringContaining("Performance"),
        expect.stringContaining("卡顿")
      ]));
      expect(snapshot.comments).toHaveLength(2);
      expect(imported).toMatchObject({ accepted: 2, inserted: 2, projectId: project.id });
      expect(duplicate).toMatchObject({ accepted: 2, inserted: 0, projectId: project.id });
      expect(await destination.getStats(project.id)).toMatchObject({
        projectCount: 1,
        commentCount: 2
      });
      expect(await source.getResearch(research.id)).toEqual(research);
      expect(await source.listResearches()).toEqual([research]);

      await source.close();
      await destination.close();
    });

    it("rejects mismatched comment project identity without mutation", async () => {
      const destination = await createStore();
      const invalid = sampleSnapshot();
      invalid.comments[0].projectId = "contradictory-project";

      await expectIdentityRejectionWithoutMutation(
        destination,
        invalid,
        "Project snapshot comment projectId mismatch: contract-comment"
      );
    });

    it("rejects mismatched report project identity without mutation", async () => {
      const destination = await createStore();
      const invalid = sampleSnapshot();
      invalid.reports.push(sampleReport("contradictory-project"));

      await expectIdentityRejectionWithoutMutation(
        destination,
        invalid,
        "Project snapshot report projectId mismatch: contract-report"
      );
    });

    it("rejects dangling label identity without mutation", async () => {
      const destination = await createStore();
      const invalid = sampleSnapshot();
      invalid.labels.push(sampleLabel("missing-comment"));

      await expectIdentityRejectionWithoutMutation(
        destination,
        invalid,
        "Project snapshot label commentId is missing: missing-comment"
      );
    });
  });
}

async function expectIdentityRejectionWithoutMutation(destination, invalid, error) {
  try {
    await expect(destination.importProject(invalid)).rejects.toThrow(error);
    expect(await destination.listProjects()).toEqual([]);
    expect(await destination.getStats()).toMatchObject({
      projectCount: 0,
      commentCount: 0
    });
  } finally {
    await destination.close();
  }
}

function sampleSnapshot() {
  const project = sampleProject();
  return {
    formatVersion: 1,
    exportedAt: "2026-07-10T00:00:00.000Z",
    project,
    comments: [
      {
        id: "contract-comment",
        projectId: project.id,
        platform: "steam",
        body: "Login crash after update",
        bodyNorm: "login crash after update",
        contentHash: "contract-comment-hash",
        collectedAt: "2026-07-10T00:00:00.000Z"
      }
    ],
    labels: [],
    reports: []
  };
}

function sampleProject() {
  const now = "2026-07-10T00:00:00.000Z";
  return {
    id: `contract-${crypto.randomUUID()}`,
    name: "LocalStore Contract",
    description: "Shared adapter behavior",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: now,
    updatedAt: now
  };
}

function sampleLabel(commentId) {
  return {
    commentId,
    sentiment: "negative",
    topic: "crash",
    intent: "bug_report",
    severity: 5,
    isBug: true,
    isChurnRisk: false,
    entities: [],
    confidence: 1,
    rationale: "Crash report",
    model: "test-model"
  };
}

function sampleReport(projectId) {
  return {
    id: "contract-report",
    runId: "contract-run",
    projectId,
    title: "Contract report",
    markdown: "# Contract report",
    summary: {
      totalComments: 1,
      negativeRate: 1,
      bugRate: 1,
      churnRiskRate: 0,
      riskIndex: 5,
      topComplaints: [],
      topBugs: [],
      entityHeat: []
    },
    createdAt: "2026-07-10T00:00:00.000Z"
  };
}

function sampleResearch() {
  const now = "2026-07-13T00:00:00.000Z";
  return {
    id: `research-${crypto.randomUUID()}`,
    request: { gameName: "幻兽帕鲁", focus: "联机稳定性", periodDays: 90 },
    status: "completed",
    sources: [],
    evidence: [],
    exclusions: [],
    reports: [],
    createdAt: now,
    updatedAt: now
  };
}
