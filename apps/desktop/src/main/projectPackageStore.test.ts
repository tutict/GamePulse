import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GamePulseProjectPackageCodec, type Project } from "@gamepulse/shared";
import { SqliteLocalStore } from "./sqliteStore.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("project package storage integration", () => {
  it("round-trips between shared codec and SQLite without duplicating repeated imports", async () => {
    const source = await createStore("source");
    await source.saveProject(project());
    await source.ingestComments("project-1", [
      { platform: "steam", body: "Login crash after update", sourceUrl: "thread-a" }
    ]);
    const codec = new GamePulseProjectPackageCodec();
    const decoded = await codec.decode(await codec.encode(await source.exportProject("project-1")));
    await source.close();

    const target = await createStore("target");
    expect(await target.importProject(decoded)).toMatchObject({ inserted: 1 });
    expect(await target.importProject(decoded)).toMatchObject({ inserted: 0 });
    expect(await target.getStats("project-1")).toMatchObject({ projectCount: 1, commentCount: 1 });
    expect((await target.exportProject("project-1")).comments[0]?.body).toBe("Login crash after update");
    await target.close();
  });
});

async function createStore(name: string): Promise<SqliteLocalStore> {
  const directory = mkdtempSync(join(tmpdir(), `gamepulse-package-${name}-`));
  temporaryDirectories.push(directory);
  const store = new SqliteLocalStore(join(directory, "gamepulse.db"));
  await store.initialize();
  return store;
}

function project(): Project {
  return {
    id: "project-1",
    name: "Project One",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z"
  };
}
