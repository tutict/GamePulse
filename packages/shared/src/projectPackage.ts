import { sha256 as sha256Hash } from "@noble/hashes/sha2.js";
import {
  strFromU8,
  strToU8,
  Unzip,
  UnzipInflate,
  UnzipPassThrough,
  unzipSync,
  zipSync
} from "fflate";
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
import {
  isSensitivePackageKey,
  sanitizeMetadata
} from "./privacy.js";

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

interface ObservedPayload {
  bytes: number;
  sha256: string;
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
      project: cleanProject(parseJson<Project>(requiredFile(files, projectPath))),
      comments: parseNdjson<CommentRecord>(requiredFile(files, commentsPath)).map(cleanComment),
      labels: parseNdjson<AnalysisLabel>(requiredFile(files, labelsPath)).map(cleanObject),
      reports: parseNdjson<Report>(requiredFile(files, reportsPath)).map(cleanObject)
    };
  }

  async decodeStream(chunks: AsyncIterable<Uint8Array>): Promise<ProjectSnapshot> {
    let manifest: PackageManifest | undefined;
    let metadata: PackageMetadata | undefined;
    let project: Project | undefined;
    const comments: CommentRecord[] = [];
    const labels: AnalysisLabel[] = [];
    const reports: Report[] = [];
    const observedPayloads = new Map<string, ObservedPayload>();
    const seenPaths = new Set<string>();
    let streamError: Error | undefined;

    const unzip = new Unzip((file) => {
      try {
        if (seenPaths.has(file.name)) {
          throw new Error(`Project package contains duplicate file: ${file.name}`);
        }
        seenPaths.add(file.name);

        switch (file.name) {
          case manifestPath:
            file.ondata = bufferedFileHandler((bytes) => {
              manifest = parseJson<PackageManifest>(bytes);
            });
            break;
          case metadataPath:
            file.ondata = bufferedPayloadHandler(file.name, observedPayloads, (bytes) => {
              metadata = parseJson<PackageMetadata>(bytes);
            });
            break;
          case projectPath:
            file.ondata = bufferedPayloadHandler(file.name, observedPayloads, (bytes) => {
              project = cleanProject(parseJson<Project>(bytes));
            });
            break;
          case commentsPath:
            file.ondata = ndjsonPayloadHandler(file.name, observedPayloads, (value) => {
              comments.push(cleanComment(value as CommentRecord));
            });
            break;
          case labelsPath:
            file.ondata = ndjsonPayloadHandler(file.name, observedPayloads, (value) => {
              labels.push(cleanObject(value as AnalysisLabel));
            });
            break;
          case reportsPath:
            file.ondata = ndjsonPayloadHandler(file.name, observedPayloads, (value) => {
              reports.push(cleanObject(value as Report));
            });
            break;
          default:
            file.ondata = (error) => {
              if (error) {
                streamError = toError(error);
              }
            };
        }

        file.start();
      } catch (error) {
        streamError = toError(error);
      }
    });
    unzip.register(UnzipPassThrough);
    unzip.register(UnzipInflate);

    let pendingChunk: Uint8Array | undefined;
    for await (const chunk of chunks) {
      if (streamError) {
        throw streamError;
      }
      if (pendingChunk) {
        unzip.push(pendingChunk, false);
      }
      pendingChunk = chunk;
    }

    if (!pendingChunk) {
      throw new Error("Project package is empty");
    }

    unzip.push(pendingChunk, true);
    if (streamError) {
      throw streamError;
    }
    if (!manifest) {
      throw new Error(`Project package is missing: ${manifestPath}`);
    }
    validateManifest(manifest);
    validateObservedPayloads(manifest, observedPayloads);

    if (!metadata) {
      throw new Error(`Project package is missing: ${metadataPath}`);
    }
    if (metadata.formatVersion !== 1) {
      throw new Error(`Unsupported project snapshot version: ${metadata.formatVersion}`);
    }
    if (!project) {
      throw new Error(`Project package is missing: ${projectPath}`);
    }

    return {
      formatVersion: 1,
      exportedAt: metadata.exportedAt,
      project,
      comments,
      labels,
      reports
    };
  }
}

function validateManifest(manifest: PackageManifest): void {
  if (manifest.packageType !== packageType) {
    throw new Error("Invalid GamePulse project package");
  }
  if (manifest.version !== packageVersion) {
    throw new Error(`Unsupported GamePulse package version: ${manifest.version}`);
  }

  const expectedPaths = new Set<string>(payloadPaths);
  const paths = new Set<string>();
  for (const entry of manifest.files) {
    if (!expectedPaths.has(entry.path)) {
      throw new Error(`Project package manifest contains unexpected file: ${entry.path}`);
    }
    if (paths.has(entry.path)) {
      throw new Error(`Project package manifest contains duplicate file: ${entry.path}`);
    }
    paths.add(entry.path);
  }

  for (const path of payloadPaths) {
    if (!paths.has(path)) {
      throw new Error(`Project package manifest is missing: ${path}`);
    }
  }
}

function validateObservedPayloads(
  manifest: PackageManifest,
  observedPayloads: Map<string, ObservedPayload>
): void {
  for (const entry of manifest.files) {
    const observed = observedPayloads.get(entry.path);
    if (!observed) {
      throw new Error(`Project package is missing: ${entry.path}`);
    }
    if (observed.bytes !== entry.bytes) {
      throw new Error(`Project package size mismatch: ${entry.path}`);
    }
    if (observed.sha256 !== entry.sha256) {
      throw new Error(`Project package hash mismatch: ${entry.path}`);
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
  return sanitizeMetadata(value);
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
        .filter(([key]) => !isSensitivePackageKey(key))
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

function bufferedPayloadHandler(
  path: string,
  observedPayloads: Map<string, ObservedPayload>,
  onComplete: (bytes: Uint8Array) => void
) {
  return bufferedFileHandler(onComplete, path, observedPayloads);
}

function bufferedFileHandler(
  onComplete: (bytes: Uint8Array) => void,
  path?: string,
  observedPayloads?: Map<string, ObservedPayload>
) {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const hash = sha256Hash.create();

  return (error: Error | null, data: Uint8Array, final: boolean): void => {
    if (error) {
      throw error;
    }

    hash.update(data);
    chunks.push(data);
    length += data.byteLength;

    if (!final) {
      return;
    }

    const bytes = joinBytes(chunks, length);
    if (path && observedPayloads) {
      observedPayloads.set(path, {
        bytes: length,
        sha256: toHex(hash.digest())
      });
    }
    onComplete(bytes);
  };
}

function ndjsonPayloadHandler(
  path: string,
  observedPayloads: Map<string, ObservedPayload>,
  onValue: (value: unknown) => void
) {
  const decoder = new TextDecoder();
  const hash = sha256Hash.create();
  let length = 0;
  let pending = "";

  return (error: Error | null, data: Uint8Array, final: boolean): void => {
    if (error) {
      throw error;
    }

    hash.update(data);
    length += data.byteLength;
    pending += decoder.decode(data, { stream: !final });

    let newlineIndex = pending.indexOf("\n");
    while (newlineIndex >= 0) {
      parseNdjsonLine(pending.slice(0, newlineIndex), onValue);
      pending = pending.slice(newlineIndex + 1);
      newlineIndex = pending.indexOf("\n");
    }

    if (!final) {
      return;
    }

    parseNdjsonLine(pending, onValue);
    observedPayloads.set(path, {
      bytes: length,
      sha256: toHex(hash.digest())
    });
  };
}

function parseNdjsonLine(line: string, onValue: (value: unknown) => void): void {
  const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (normalized.trim()) {
    onValue(JSON.parse(normalized) as unknown);
  }
}

function joinBytes(chunks: Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function requiredFile(files: Record<string, Uint8Array>, path: string): Uint8Array {
  const file = files[path];
  if (!file) {
    throw new Error(`Project package is missing: ${path}`);
  }
  return file;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  return toHex(sha256Hash(bytes));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
