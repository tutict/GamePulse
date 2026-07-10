import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import type { ProjectSnapshot } from "./contracts.js";
import { GamePulseProjectPackageCodec } from "./projectPackage.js";

describe(".gamepulse package integrity", () => {
  it("rejects tampered payloads", async () => {
    const codec = new GamePulseProjectPackageCodec();
    const files = unzipSync(await codec.encode(snapshot()));
    files["comments.ndjson"] = strToU8('{"id":"tampered"}\n');

    await expect(codec.decode(zipSync(files))).rejects.toThrow("mismatch");
  });

  it("rejects unknown package versions", async () => {
    const codec = new GamePulseProjectPackageCodec();
    const files = unzipSync(await codec.encode(snapshot()));
    const manifest = JSON.parse(strFromU8(files["manifest.json"]!)) as { version: number };
    manifest.version = 99;
    files["manifest.json"] = strToU8(JSON.stringify(manifest));

    await expect(codec.decode(zipSync(files))).rejects.toThrow("Unsupported GamePulse package version");
  });
});

function snapshot(): ProjectSnapshot {
  return {
    formatVersion: 1,
    exportedAt: "2026-07-10T00:00:00.000Z",
    project: {
      id: "project-1",
      name: "Project One",
      redditSubreddits: [],
      redditKeywords: [],
      sourceLinks: [],
      versionWindows: [],
      entityAliases: [],
      createdAt: "2026-07-10T00:00:00.000Z",
      updatedAt: "2026-07-10T00:00:00.000Z"
    },
    comments: [],
    labels: [],
    reports: []
  };
}
