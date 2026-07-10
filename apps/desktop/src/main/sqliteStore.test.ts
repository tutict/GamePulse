import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Project } from "@gamepulse/shared";
import { SqliteLocalStore } from "./sqliteStore.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SqliteLocalStore", () => {
  it("persists comments, deduplicates imports, searches Chinese text, and reports stats", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-sqlite-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "gamepulse.db");
    const store = new SqliteLocalStore(databasePath);

    await store.initialize();
    await store.saveProject(project());
    const first = await store.ingestComments("project-1", [
      { platform: "steam", body: "更新后登录失败，完全无法进入游戏", sourceUrl: "thread-a" },
      { platform: "steam", body: "更新后登录失败，完全无法进入游戏", sourceUrl: "thread-a" },
      { platform: "reddit", body: "Crash after login", sourceUrl: "thread-b" }
    ]);

    expect(first).toEqual({ accepted: 3, inserted: 2 });
    expect((await store.searchEvidence({ projectId: "project-1", query: "登录", limit: 8 }))[0]?.body).toContain("登录失败");
    expect(await store.getStats("project-1")).toMatchObject({
      databasePath,
      projectCount: 1,
      commentCount: 2
    });
    await store.close();

    const reopened = new SqliteLocalStore(databasePath);
    await reopened.initialize();
    expect((await reopened.searchEvidence({ projectId: "project-1", query: "crash", limit: 8 }))[0]?.platform).toBe("reddit");
    await reopened.close();
  });
});

function project(): Project {
  return {
    id: "project-1",
    name: "Test Project",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z"
  };
}
