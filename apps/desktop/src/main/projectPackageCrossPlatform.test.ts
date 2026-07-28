import { createHash } from "node:crypto";
import Database from "better-sqlite3";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  GamePulseProjectPackageCodec,
  type LocalStore,
  type ProjectSnapshot
} from "@gamepulse/shared";
import { SqliteLocalStore } from "./sqliteStore.js";

const mobileStoreModulePath = "../../../mobile/src/storage/capacitorSqliteStore.js";

const directions = [
  {
    name: "desktop to mobile",
    createSource: createDesktopStore,
    createDestination: createMobileStore
  },
  {
    name: "mobile to desktop",
    createSource: createMobileStore,
    createDestination: createDesktopStore
  }
];

describe("cross-platform project packages", () => {
  it.each(directions)("preserves valid logical identity $name", async ({
    createSource,
    createDestination
  }) => {
    const source = await createSource();
    const destination = await createDestination();
    const expected = sampleSnapshot();
    const codec = new GamePulseProjectPackageCodec();

    try {
      await source.importProject(expected);
      const bytes = await codec.encode(await source.exportProject(expected.project.id));
      await destination.importProject(await codec.decode(bytes));

      expect(logicalIdentity(await destination.exportProject(expected.project.id))).toEqual(
        logicalIdentity(expected)
      );
    } finally {
      await source.close();
      await destination.close();
    }
  });

  it.each([
    { name: "desktop", createDestination: createDesktopStore },
    { name: "mobile", createDestination: createMobileStore }
  ])("rejects a correctly hashed contradictory package before $name mutation", async ({
    createDestination
  }) => {
    const destination = await createDestination();
    const codec = new GamePulseProjectPackageCodec();

    try {
      await expect(
        importPackage(codec, await contradictoryPackage(codec), destination)
      ).rejects.toThrow(
        "Project snapshot comment projectId mismatch: cross-platform-comment"
      );
      expect(await destination.listProjects()).toEqual([]);
      expect(await destination.getStats()).toMatchObject({
        projectCount: 0,
        commentCount: 0
      });
    } finally {
      await destination.close();
    }
  });
});

async function importPackage(
  codec: GamePulseProjectPackageCodec,
  bytes: Uint8Array,
  destination: LocalStore
): Promise<void> {
  await destination.importProject(await codec.decode(bytes));
}

async function contradictoryPackage(
  codec: GamePulseProjectPackageCodec
): Promise<Uint8Array> {
  const invalid = sampleSnapshot();
  invalid.comments[0]!.projectId = "contradictory-project";

  const files = unzipSync(await codec.encode(sampleSnapshot()));
  const payload = strToU8(`${invalid.comments.map((comment) => JSON.stringify(comment)).join("\n")}\n`);
  files["comments.ndjson"] = payload;

  const manifestBytes = files["manifest.json"];
  if (!manifestBytes) {
    throw new Error("Missing manifest.json");
  }
  const manifest = JSON.parse(strFromU8(manifestBytes)) as {
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
  const commentEntry = manifest.files.find((entry) => entry.path === "comments.ndjson");
  if (!commentEntry) {
    throw new Error("Missing comments.ndjson manifest entry");
  }
  commentEntry.bytes = payload.byteLength;
  commentEntry.sha256 = createHash("sha256").update(payload).digest("hex");
  files["manifest.json"] = strToU8(`${JSON.stringify(manifest)}\n`);

  return zipSync(files);
}

function logicalIdentity(snapshot: ProjectSnapshot) {
  return {
    formatVersion: snapshot.formatVersion,
    project: snapshot.project,
    comments: snapshot.comments.map((comment) => ({
      id: comment.id,
      projectId: comment.projectId,
      contentHash: comment.contentHash
    })),
    labels: snapshot.labels.map((label) => ({
      commentId: label.commentId
    })),
    reports: snapshot.reports.map((report) => ({
      id: report.id,
      projectId: report.projectId
    }))
  };
}

async function createDesktopStore(): Promise<LocalStore> {
  const store = new SqliteLocalStore(":memory:");
  await store.initialize();
  return store;
}

async function createMobileStore(): Promise<LocalStore> {
  const { CapacitorSqliteLocalStore } = await import(mobileStoreModulePath) as {
    CapacitorSqliteLocalStore: new (driver: BetterSqliteTestDriver) => LocalStore;
  };
  const store = new CapacitorSqliteLocalStore(new BetterSqliteTestDriver());
  await store.initialize();
  return store;
}

class BetterSqliteTestDriver {
  private database: Database.Database | undefined;

  async open(): Promise<void> {
    this.database = new Database(":memory:");
    this.database.pragma("foreign_keys = ON");
  }

  async close(): Promise<void> {
    this.database?.close();
    this.database = undefined;
  }

  async execute(statements: string): Promise<void> {
    this.requireDatabase().exec(statements);
  }

  async run(statement: string, values: unknown[] = []): Promise<number> {
    return this.requireDatabase().prepare(statement).run(...values).changes;
  }

  async query<T extends Record<string, unknown>>(
    statement: string,
    values: unknown[] = []
  ): Promise<T[]> {
    return this.requireDatabase().prepare(statement).all(...values) as T[];
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const database = this.requireDatabase();
    database.exec("BEGIN");
    try {
      const result = await operation();
      database.exec("COMMIT");
      return result;
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  private requireDatabase(): Database.Database {
    if (!this.database) {
      throw new Error("Test database is not open");
    }
    return this.database;
  }
}

function sampleSnapshot(): ProjectSnapshot {
  const timestamp = "2026-07-10T00:00:00.000Z";
  return {
    formatVersion: 1,
    exportedAt: timestamp,
    project: {
      id: "cross-platform-project",
      name: "Cross-platform project",
      description: "Deterministic package fixture",
      redditSubreddits: [],
      redditKeywords: [],
      sourceLinks: [],
      versionWindows: [],
      entityAliases: [],
      createdAt: timestamp,
      updatedAt: timestamp
    },
    comments: [
      {
        id: "cross-platform-comment",
        projectId: "cross-platform-project",
        platform: "steam",
        body: "Login crash after update",
        bodyNorm: "login crash after update",
        contentHash: "cross-platform-comment-hash",
        collectedAt: timestamp
      }
    ],
    labels: [
      {
        commentId: "cross-platform-comment",
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
      }
    ],
    reports: [
      {
        id: "cross-platform-report",
        runId: "cross-platform-run",
        projectId: "cross-platform-project",
        title: "Cross-platform report",
        markdown: "# Cross-platform report",
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
        createdAt: timestamp
      }
    ]
  };
}
