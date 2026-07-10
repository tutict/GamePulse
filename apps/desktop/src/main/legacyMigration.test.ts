import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateLegacyJsonStore } from "./legacyMigration.js";
import { SqliteLocalStore } from "./sqliteStore.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("legacy JSON migration", () => {
  it("moves valid data into SQLite and keeps the original as a legacy backup", async () => {
    const directory = createTemporaryDirectory();
    const legacyPath = join(directory, "gamepulse-store.json");
    const databasePath = join(directory, "gamepulse.db");
    writeFileSync(legacyPath, JSON.stringify(legacyStore()), "utf8");

    const result = await migrateLegacyJsonStore({ databasePath, legacyPath });

    expect(result).toMatchObject({ migrated: true, projectCount: 1, commentCount: 1 });
    expect(existsSync(legacyPath)).toBe(false);
    expect(existsSync(join(directory, "gamepulse-store.legacy-backup.json"))).toBe(true);

    const store = new SqliteLocalStore(databasePath);
    await store.initialize();
    expect(await store.getStats()).toMatchObject({ projectCount: 1, commentCount: 1 });
    await store.close();
  });

  it("leaves the original JSON untouched when migration fails", async () => {
    const directory = createTemporaryDirectory();
    const legacyPath = join(directory, "gamepulse-store.json");
    const databasePath = join(directory, "gamepulse.db");
    writeFileSync(legacyPath, "{invalid", "utf8");

    await expect(migrateLegacyJsonStore({ databasePath, legacyPath })).rejects.toThrow();

    expect(existsSync(legacyPath)).toBe(true);
    expect(existsSync(join(directory, "gamepulse-store.legacy-backup.json"))).toBe(false);
  });
});

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "gamepulse-migration-"));
  temporaryDirectories.push(directory);
  return directory;
}

function legacyStore() {
  return {
    version: 1,
    projects: [
      {
        id: "desktop-collector",
        name: "Desktop Collector",
        description: "Legacy project",
        createdAt: "2026-07-10T00:00:00.000Z",
        updatedAt: "2026-07-10T00:00:00.000Z"
      }
    ],
    rawItems: [
      {
        id: "legacy-comment",
        projectId: "desktop-collector",
        platform: "steam",
        sourceUrl: "https://example.test/review",
        sourceTitle: "Review",
        body: "Legacy login crash",
        bodyNorm: "legacy login crash",
        collectedAt: "2026-07-10T00:00:00.000Z",
        contentHash: "legacy-hash",
        metadata: {}
      }
    ]
  };
}
