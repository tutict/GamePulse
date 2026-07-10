import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import type {
  AnalysisLabel,
  CommentRecord,
  Project,
  Report
} from "./domain.js";
import type {
  ProjectPackageCodec,
  ProjectSnapshot
} from "./contracts.js";
import { sanitizeMetadata } from "./privacy.js";

const packageType = "gamepulse-project";
const packageVersion = 1;
const manifestPath = "manifest.json";
const metadataPath = "metadata.json";
const projectPath = "project.json";
const commentsPath = "comments.ndjson";
const labelsPath = "labels.ndjson";
const reportsPath = "reports.ndjson";
const payloadPaths = [
  metadataPath,
  projectPath,
  commentsPath,
  labelsPath,
  reportsPath
] as const;

interface PackageManifest {
  packageType: typeof packageType;
  version: number;
  createdAt: string;
  files: Array<{
    path: string;
    bytes: number;
    sha256: string;
  }>;
}

interface PackageMetadata {
  formatVersion: 1;
  exportedAt: string;
}

export class GamePulseProjectPackageCodec implements ProjectPackageCodec {
  async encode(snapshot: ProjectSnapshot): Promise<Uint8Array> {
    if (snapshot.formatVersion !== 1) {
      throw new Error(`Unsupported project snapshot version: ${snapshot.formatVersion}`);
    }

    const payloads: Record<string, Uint8Array> = {
      [metadataPath]: jsonBytes({
        formatVersion: 1,
        exportedAt: snapshot.exportedAt
      } satisfies PackageMetadata),
      [projectPath]: jsonBytes(cleanProject(snapshot.project)),
      [commentsPath]: ndjsonBytes(snapshot.comments.map(cleanComment)),
      [labelsPath]: ndjsonBytes(snapshot.labels.map(cleanObject)),
      [reportsPath]: ndjsonBytes(snapshot.reports.map(cleanObject))
    };
    const files = [];

    for (const path of payloadPaths) {
      const bytes = payloads[path];
      if (!bytes) {
        throw new Error(`Missing project package payload: ${path}`);
      }
      files.push({
        path,
        bytes: bytes.byteLength,
        sha256: await sha256(bytes)
      });
    }

    const manifest: PackageManifest = {
      packageType,
      version: packageVersion,
      createdAt: new Date().toISOString(),
      files
    };

    return zipSync({
      ...payloads,
      [manifestPath]: jsonBytes(manifest)
    }, { level: 6 });
  }

  async decode(bytes: Uint8Array): Promise<ProjectSnapshot> {
    const files = unzipSync(bytes);
    const manifest = parseJson<PackageManifest>(requiredFile(files, manifestPath));
    validateManifest(manifest);

    for (const entry of manifest.files) {
      const payload = requiredFile(files, entry.path);
      if (payload.byteLength !== entry.bytes) {
        throw new Error(`Project package size mismatch: ${entry.path}`);
      }
      if (await sha256(payload) !== entry.sha256) {
        throw new Error(`Project package hash mismatch: ${entry.path}`);
      }
    }

    const metadata = parseJson<PackageMetadata>(requiredFile(files, metadataPath));
    if (metadata.formatVersion !== 1) {
      throw new Error(`Unsupported project snapshot version: ${metadata.formatVersion}`);
    }

    return {
      formatVersion: 1,
      exportedAt: metadata.exportedAt,
      project: parseJson<Project>(requiredFile(files, projectPath)),
      comments: parseNdjson<CommentRecord>(requiredFile(files, commentsPath)).map(cleanComment),
      labels: parseNdjson<AnalysisLabel>(requiredFile(files, labelsPath)).map(cleanObject),
      reports: parseNdjson<Report>(requiredFile(files, reportsPath)).map(cleanObject)
    };
  }

  async decodeStream(chunks: AsyncIterable<Uint8Array>): Promise<ProjectSnapshot> {
    const collected: Uint8Array[] = [];
    let length = 0;

    for await (const chunk of chunks) {
      collected.push(chunk);
      length += chunk.byteLength;
    }

    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of collected) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return this.decode(bytes);
  }
}

function validateManifest(manifest: PackageManifest): void {
  if (manifest.packageType !== packageType) {
    throw new Error("Invalid GamePulse project package");
  }
  if (manifest.version !== packageVersion) {
    throw new Error(`Unsupported GamePulse package version: ${manifest.version}`);
  }
  const paths = new Set(manifest.files.map((entry) => entry.path));
  for (const path of payloadPaths) {
    if (!paths.has(path)) {
      throw new Error(`Project package manifest is missing: ${path}`);
    }
  }
}

function cleanProject(project: Project): Project {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    steamAppId: project.steamAppId,
    redditSubreddits: [...project.redditSubreddits],
    redditKeywords: [...project.redditKeywords],
    sourceLinks: project.sourceLinks.map((link) => ({ ...link })),
    versionWindows: project.versionWindows.map((window) => ({ ...window })),
    entityAliases: project.entityAliases.map((entity) => ({
      ...entity,
      aliases: [...entity.aliases]
    })),
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function cleanComment(comment: CommentRecord): CommentRecord {
  return {
    id: comment.id,
    projectId: comment.projectId,
    platform: comment.platform,
    body: comment.body,
    bodyNorm: comment.bodyNorm,
    contentHash: comment.contentHash,
    collectedAt: comment.collectedAt,
    sourceUrl: comment.sourceUrl,
    sourceTitle: comment.sourceTitle,
    externalId: comment.externalId,
    authorHash: comment.authorHash,
    postedAt: comment.postedAt,
    language: comment.language,
    upvotes: comment.upvotes,
    replies: comment.replies,
    metadata: sanitizePackageMetadata(comment.metadata)
  };
}

function sanitizePackageMetadata(value: unknown): Record<string, unknown> {
  const metadata = sanitizeMetadata(value);
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !/api.?key|token|secret|credential|device|cache|path/i.test(key))
  );
}

function cleanObject<T>(value: T): T {
  return deepSanitize(value) as T;
}

function deepSanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(deepSanitize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !/api.?key|token|secret|credential|devicePath|cachePath/i.test(key))
        .map(([key, entry]) => [key, deepSanitize(entry)])
    );
  }
  return value;
}

function jsonBytes(value: unknown): Uint8Array {
  return strToU8(`${JSON.stringify(value)}\n`);
}

function ndjsonBytes(values: unknown[]): Uint8Array {
  return strToU8(values.length === 0 ? "" : `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

function parseJson<T>(bytes: Uint8Array): T {
  return JSON.parse(strFromU8(bytes)) as T;
}

function parseNdjson<T>(bytes: Uint8Array): T[] {
  const rows: T[] = [];
  for (const line of strFromU8(bytes).split(/\r?\n/)) {
    if (line.trim()) {
      rows.push(JSON.parse(line) as T);
    }
  }
  return rows;
}

function requiredFile(files: Record<string, Uint8Array>, path: string): Uint8Array {
  const file = files[path];
  if (!file) {
    throw new Error(`Project package is missing: ${path}`);
  }
  return file;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as Uint8Array<ArrayBuffer>
  );
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
