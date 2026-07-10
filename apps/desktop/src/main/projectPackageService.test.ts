import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Project } from "@gamepulse/shared";
import { SqliteLocalStore } from "./sqliteStore.js";
import { ProjectPackageService } from "./projectPackageService.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, {
    recursive: true,
    force: true
  })));
});

describe("ProjectPackageService", () => {
  it("streams a package into another store and keeps duplicate imports idempotent", async () => {
    const source = await createStore("source");
    const destination = await createStore("destination");
    const project = sampleProject();
    await source.saveProject(project);
    await source.ingestComments(project.id, [{
      platform: "steam",
      body: "Great frame pacing after the latest patch.",
      sourceUrl: "https://example.test/review/1"
    }]);

    const bytes = await new ProjectPackageService(source).exportProject(project.id);
    const service = new ProjectPackageService(destination);
    const first = await service.importProjectStream(chunk(bytes, 17));
    const second = await service.importProjectStream(chunk(bytes, 11));

    expect(first).toMatchObject({ accepted: 1, inserted: 1, projectId: project.id });
    expect(second).toMatchObject({ accepted: 1, inserted: 0, projectId: project.id });
    expect((await destination.exportProject(project.id)).comments).toHaveLength(1);

    await source.close();
    await destination.close();
  });
});

async function createStore(name: string): Promise<SqliteLocalStore> {
  const directory = await mkdtemp(join(tmpdir(), `gamepulse-package-${name}-`));
  temporaryDirectories.push(directory);
  const store = new SqliteLocalStore(join(directory, "store.db"));
  await store.initialize();
  return store;
}

function sampleProject(): Project {
  const now = "2026-07-10T00:00:00.000Z";
  return {
    id: "project-package-stream",
    name: "Package Stream",
    description: "Project package stream test",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: now,
    updatedAt: now
  };
}

async function* chunk(bytes: Uint8Array, size: number): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < bytes.byteLength; offset += size) {
    yield bytes.slice(offset, offset + size);
  }
}
