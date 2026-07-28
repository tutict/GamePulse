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

it.each([
  {
    name: 'comment project identity',
    payloadPath: 'comments.ndjson' as const,
    error: 'Project snapshot comment projectId mismatch: comment-1',
    mutate(value: ProjectSnapshot) {
      value.comments[0]!.projectId = 'project-2';
    }
  },
  {
    name: 'report project identity',
    payloadPath: 'reports.ndjson' as const,
    error: 'Project snapshot report projectId mismatch: report-1',
    mutate(value: ProjectSnapshot) {
      value.reports.push({
        id: 'report-1',
        runId: 'run-1',
        projectId: 'project-2',
        title: 'Report',
        markdown: '# Report',
        summary: {
          totalComments: 0,
          negativeRate: 0,
          bugRate: 0,
          churnRiskRate: 0,
          riskIndex: 0,
          topComplaints: [],
          topBugs: [],
          entityHeat: []
        },
        createdAt: '2026-07-10T00:00:00.000Z'
      });
    }
  },
  {
    name: 'label comment identity',
    payloadPath: 'labels.ndjson' as const,
    error: 'Project snapshot label commentId is missing: comment-2',
    mutate(value: ProjectSnapshot) {
      value.labels.push({
        commentId: 'comment-2',
        sentiment: 'negative',
        topic: 'crash',
        intent: 'bug_report',
        severity: 5,
        isBug: true,
        isChurnRisk: false,
        entities: [],
        confidence: 1,
        rationale: 'Crash report',
        model: 'test-model'
      });
    }
  }
])('rejects $name at every codec boundary', async ({ payloadPath, error, mutate }) => {
  const codec = new GamePulseProjectPackageCodec();
  const invalid = snapshot();
  mutate(invalid);

  await expect(codec.encode(invalid)).rejects.toThrow(error);

  const bytes = await invalidPackage(codec, invalid, payloadPath);
  await expect(codec.decode(bytes)).rejects.toThrow(error);
  await expect(codec.decodeStream(chunks(bytes, 7))).rejects.toThrow(error);
});

async function invalidPackage(
  codec: GamePulseProjectPackageCodec,
  invalid: ProjectSnapshot,
  payloadPath: 'comments.ndjson' | 'labels.ndjson' | 'reports.ndjson'
): Promise<Uint8Array> {
  const { strFromU8, strToU8, unzipSync, zipSync } = await import('fflate');
  const files = unzipSync(await codec.encode(snapshot()));
  const values = {
    'comments.ndjson': invalid.comments,
    'labels.ndjson': invalid.labels,
    'reports.ndjson': invalid.reports
  }[payloadPath];
  const payload = strToU8(`${values.map((value) => JSON.stringify(value)).join('\n')}\n`);
  files[payloadPath] = payload;

  const manifest = JSON.parse(strFromU8(files['manifest.json']!)) as {
    files: Array<{ path: string; bytes: number; sha256: string }>;
  };
  const entry = manifest.files.find((value) => value.path === payloadPath);
  if (!entry) {
    throw new Error(`Missing manifest entry: ${payloadPath}`);
  }
  entry.bytes = payload.byteLength;
  entry.sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', payload)),
    (value) => value.toString(16).padStart(2, '0')
  ).join('');
  files['manifest.json'] = strToU8(`${JSON.stringify(manifest)}\n`);

  return zipSync(files);
}

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
