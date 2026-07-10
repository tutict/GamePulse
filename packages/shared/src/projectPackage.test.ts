import { describe, expect, it } from "vitest";
import type { ProjectSnapshot } from "./contracts.js";
import { GamePulseProjectPackageCodec } from "./projectPackage.js";

describe(".gamepulse project packages", () => {
  it("round-trips streamed NDJSON data without sensitive metadata", async () => {
    const codec = new GamePulseProjectPackageCodec();
    const bytes = await codec.encode(snapshot());
    const decoded = await codec.decodeStream(chunks(bytes, 17));

    expect(decoded.project).toEqual(snapshot().project);
    expect(decoded.comments).toHaveLength(1);
    expect(decoded.comments[0]?.body).toBe("Login crash after update");
    expect(decoded.comments[0]?.metadata).toEqual({ selector: ".review" });
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
    comments: [
      {
        id: "comment-1",
        projectId: "project-1",
        platform: "steam",
        body: "Login crash after update",
        bodyNorm: "login crash after update",
        contentHash: "hash-1",
        collectedAt: "2026-07-10T00:00:00.000Z",
        metadata: {
          selector: ".review",
          apiToken: "must-not-leak",
          devicePath: "C:\\Users\\secret"
        }
      }
    ],
    labels: [],
    reports: []
  };
}

async function* chunks(bytes: Uint8Array, size: number): AsyncIterable<Uint8Array> {
  for (let offset = 0; offset < bytes.length; offset += size) {
    yield bytes.slice(offset, offset + size);
  }
}
