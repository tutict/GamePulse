import { describe, expect, it } from "vitest";
import type { ProjectSnapshot } from "./contracts.js";
import { GamePulseProjectPackageCodec } from "./projectPackage.js";

describe(".gamepulse project packages", () => {
  it("round-trips streamed NDJSON data without nested sensitive metadata", async () => {
    const codec = new GamePulseProjectPackageCodec();
    const bytes = await codec.encode(snapshot());
    const decoded = await codec.decodeStream(chunks(bytes, 1));

    expect(decoded.project).toEqual(snapshot().project);
    expect(decoded.comments).toHaveLength(1);
    expect(decoded.comments[0]?.body).toBe("登录后崩溃 Login crash after update");
    expect(decoded.comments[0]?.metadata).toEqual({
      selector: ".review",
      nested: {
        safe: "kept",
        items: [{ label: "kept" }]
      }
    });
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
        body: "登录后崩溃 Login crash after update",
        bodyNorm: "登录后崩溃 login crash after update",
        contentHash: "hash-1",
        collectedAt: "2026-07-10T00:00:00.000Z",
        metadata: {
          selector: ".review",
          apiToken: "must-not-leak",
          devicePath: "C:\\Users\\secret",
          nested: {
            safe: "kept",
            credentials: "must-not-leak",
            items: [
              {
                label: "kept",
                apiKey: "must-not-leak",
                cachePath: "C:\\cache"
              }
            ]
          }
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
