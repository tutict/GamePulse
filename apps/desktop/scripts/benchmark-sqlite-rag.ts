import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import type { IngestItem, Project } from "@gamepulse/shared";
import { SqliteLocalStore } from "../src/main/sqliteStore.js";

const itemCount = 100_000;
const batchSize = 5_000;
const directory = mkdtempSync(join(tmpdir(), "gamepulse-benchmark-"));
const store = new SqliteLocalStore(join(directory, "gamepulse.db"));

try {
  await store.initialize();
  await store.saveProject(project());

  for (let offset = 0; offset < itemCount; offset += batchSize) {
    const items: IngestItem[] = [];
    for (let index = offset; index < Math.min(itemCount, offset + batchSize); index += 1) {
      const marker = index % 100 === 0 ? "login crash marker" : "ordinary balance feedback";
      items.push({
        platform: index % 2 === 0 ? "steam" : "reddit",
        body: `${marker} comment ${index}`,
        sourceUrl: `https://example.test/thread/${Math.floor(index / 20)}`
      });
    }
    await store.ingestComments("benchmark", items);
  }

  const durations: number[] = [];
  for (let index = 0; index < 30; index += 1) {
    const start = performance.now();
    const evidence = await store.searchEvidence({
      projectId: "benchmark",
      query: index % 2 === 0 ? "login crash" : "balance feedback",
      limit: 8
    });
    if (evidence.length === 0) {
      throw new Error("Benchmark query returned no evidence");
    }
    durations.push(performance.now() - start);
  }

  durations.sort((a, b) => a - b);
  const p95 = durations[Math.ceil(durations.length * 0.95) - 1] ?? Number.POSITIVE_INFINITY;
  console.log(JSON.stringify({
    itemCount,
    samples: durations.length,
    medianMs: round(durations[Math.floor(durations.length / 2)] ?? 0),
    p95Ms: round(p95),
    maxMs: round(durations.at(-1) ?? 0)
  }));

  if (p95 >= 300) {
    throw new Error(`SQLite retrieval P95 ${p95.toFixed(2)}ms exceeds 300ms target`);
  }
} finally {
  await store.close();
  rmSync(directory, { recursive: true, force: true });
}

function project(): Project {
  return {
    id: "benchmark",
    name: "Benchmark",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: "2026-07-10T00:00:00.000Z",
    updatedAt: "2026-07-10T00:00:00.000Z"
  };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
