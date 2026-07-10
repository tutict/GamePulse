import { describe, expect, it } from "vitest";
import { normalizeSnapshot, parseArguments } from "./export-postgres-to-gamepulse.mjs";

describe("PostgreSQL project exporter", () => {
  it("parses explicit connection and output arguments", () => {
    expect(
      parseArguments([
        "--database-url",
        "postgres://localhost/gamepulse",
        "--project-id",
        "project-1",
        "--out",
        "backup.gamepulse"
      ])
    ).toMatchObject({
      databaseUrl: "postgres://localhost/gamepulse",
      projectId: "project-1",
      out: "backup.gamepulse",
      psql: "psql"
    });
  });

  it("normalizes timestamps and excludes server caches from the snapshot", () => {
    const snapshot = normalizeSnapshot(
      {
        project: {
          id: "project-1",
          name: "Project",
          redditSubreddits: [],
          redditKeywords: [],
          sourceLinks: [],
          versionWindows: [],
          entityAliases: [],
          createdAt: "2025-01-01 00:00:00+00",
          updatedAt: "2025-01-02 00:00:00+00"
        },
        comments: [
          {
            id: "comment-1",
            projectId: "project-1",
            platform: "import",
            body: "Stable frame pacing",
            bodyNorm: "Stable frame pacing",
            contentHash: "hash",
            collectedAt: "2025-01-03 00:00:00+00"
          }
        ],
        labels: [],
        reports: []
      },
      "2025-01-04T00:00:00.000Z"
    );

    expect(snapshot.exportedAt).toBe("2025-01-04T00:00:00.000Z");
    expect(snapshot.project.createdAt).toBe("2025-01-01T00:00:00.000Z");
    expect(snapshot.comments[0].collectedAt).toBe("2025-01-03T00:00:00.000Z");
    expect(snapshot).not.toHaveProperty("modelCache");
    expect(snapshot).not.toHaveProperty("embeddingCache");
  });
});
