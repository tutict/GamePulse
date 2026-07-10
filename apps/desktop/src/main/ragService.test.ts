import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Project } from "@gamepulse/shared";
import { runLocalRagQuery } from "./ragService.js";
import { SqliteLocalStore } from "./sqliteStore.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local RAG service", () => {
  it("retrieves SQLite evidence and returns a grounded fallback when no evidence matches", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-rag-"));
    temporaryDirectories.push(directory);
    const store = new SqliteLocalStore(join(directory, "gamepulse.db"));
    await store.initialize();
    await store.saveProject(project());
    await store.ingestComments("desktop-collector", [
      { platform: "steam", body: "The game crashes after login", sourceUrl: "thread-a" }
    ]);

    const matched = await runLocalRagQuery(store, { query: "crash" });
    expect(matched.evidence).toHaveLength(1);
    expect(matched.answer).toContain("[E1]");
    expect(matched.contextCharacterCount).toBeLessThanOrEqual(12_000);

    const empty = await runLocalRagQuery(store, { query: "完全无关的证据" });
    expect(empty.evidence).toHaveLength(0);
    expect(empty.answer).toContain("没有找到");
    await store.close();
  });
});

function project(): Project {
  return {
    id: "desktop-collector",
    name: "Desktop Collector",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z"
  };
}
