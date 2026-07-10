import {
  copyFileSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync
} from "node:fs";
import {
  buildRagContentHash,
  normalizeCommentText,
  sanitizeMetadata,
  type CommentRecord,
  type Platform,
  type Project,
  type ProjectSnapshot
} from "@gamepulse/shared";
import { SqliteLocalStore } from "./sqliteStore.js";

interface LegacyProject {
  id?: unknown;
  name?: unknown;
  description?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

interface LegacyComment {
  id?: unknown;
  projectId?: unknown;
  platform?: unknown;
  sourceUrl?: unknown;
  sourceTitle?: unknown;
  body?: unknown;
  bodyNorm?: unknown;
  collectedAt?: unknown;
  contentHash?: unknown;
  metadata?: unknown;
}

interface LegacyStore {
  version?: unknown;
  projects?: unknown;
  rawItems?: unknown;
}

export interface LegacyMigrationOptions {
  databasePath: string;
  legacyPath: string;
  backupPath?: string;
}

export interface LegacyMigrationResult {
  migrated: boolean;
  projectCount: number;
  commentCount: number;
  backupPath?: string;
}

export async function migrateLegacyJsonStore(
  options: LegacyMigrationOptions
): Promise<LegacyMigrationResult> {
  if (!existsSync(options.legacyPath) || existsSync(options.databasePath)) {
    return { migrated: false, projectCount: 0, commentCount: 0 };
  }

  const temporaryPath = `${options.databasePath}.migrating`;
  const backupPath = options.backupPath ?? defaultBackupPath(options.legacyPath);
  removeSqliteFiles(temporaryPath);

  const legacy = parseLegacyStore(readFileSync(options.legacyPath, "utf8"));
  const snapshots = buildSnapshots(legacy);
  const store = new SqliteLocalStore(temporaryPath);

  try {
    await store.initialize();
    for (const snapshot of snapshots) {
      await store.importProject(snapshot);
    }
    const stats = await store.getStats();
    await store.close();

    renameSync(temporaryPath, options.databasePath);
    copyFileSync(options.legacyPath, backupPath);
    unlinkSync(options.legacyPath);

    return {
      migrated: true,
      projectCount: stats.projectCount,
      commentCount: stats.commentCount,
      backupPath
    };
  } catch (error) {
    await store.close().catch(() => undefined);
    removeSqliteFiles(temporaryPath);
    throw error;
  }
}

function parseLegacyStore(content: string): LegacyStore {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("Legacy GamePulse store must be a JSON object");
  }
  if (parsed.version !== 1) {
    throw new Error(`Unsupported legacy store version: ${String(parsed.version)}`);
  }
  if (!Array.isArray(parsed.projects) || !Array.isArray(parsed.rawItems)) {
    throw new Error("Legacy GamePulse store is missing projects or rawItems");
  }
  return parsed;
}

function buildSnapshots(legacy: LegacyStore): ProjectSnapshot[] {
  const exportedAt = new Date().toISOString();
  const projects = new Map<string, Project>();

  for (const value of legacy.projects as unknown[]) {
    const project = parseLegacyProject(value);
    projects.set(project.id, project);
  }

  const commentsByProject = new Map<string, CommentRecord[]>();
  for (const value of legacy.rawItems as unknown[]) {
    const comment = parseLegacyComment(value);
    if (!projects.has(comment.projectId)) {
      projects.set(comment.projectId, placeholderProject(comment.projectId, comment.collectedAt));
    }
    const comments = commentsByProject.get(comment.projectId) ?? [];
    comments.push(comment);
    commentsByProject.set(comment.projectId, comments);
  }

  return Array.from(projects.values()).map((project) => ({
    formatVersion: 1,
    exportedAt,
    project,
    comments: commentsByProject.get(project.id) ?? [],
    labels: [],
    reports: []
  }));
}

function parseLegacyProject(value: unknown): Project {
  if (!isRecord(value)) {
    throw new Error("Legacy project must be an object");
  }
  const row = value as LegacyProject;
  const id = requiredString(row.id, "Legacy project id");
  const createdAt = optionalString(row.createdAt) ?? new Date().toISOString();

  return {
    id,
    name: optionalString(row.name) ?? "Imported Project",
    description: optionalString(row.description),
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt,
    updatedAt: optionalString(row.updatedAt) ?? createdAt
  };
}

function parseLegacyComment(value: unknown): CommentRecord {
  if (!isRecord(value)) {
    throw new Error("Legacy comment must be an object");
  }
  const row = value as LegacyComment;
  const id = requiredString(row.id, "Legacy comment id");
  const projectId = requiredString(row.projectId, "Legacy comment projectId");
  const platform = (optionalString(row.platform) ?? "import") as Platform;
  const body = normalizeCommentText(requiredString(row.body, "Legacy comment body"));
  const sourceUrl = optionalString(row.sourceUrl);
  const collectedAt = optionalString(row.collectedAt) ?? new Date().toISOString();

  return {
    id,
    projectId,
    platform,
    sourceUrl,
    sourceTitle: optionalString(row.sourceTitle),
    body,
    bodyNorm: normalizeCommentText(optionalString(row.bodyNorm) ?? body).toLowerCase(),
    contentHash: optionalString(row.contentHash) ?? buildRagContentHash({ platform, sourceUrl, body }),
    collectedAt,
    metadata: sanitizeMetadata(row.metadata)
  };
}

function placeholderProject(id: string, createdAt: string): Project {
  return {
    id,
    name: "Imported Project",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt,
    updatedAt: createdAt
  };
}

function defaultBackupPath(legacyPath: string): string {
  return legacyPath.toLowerCase().endsWith(".json")
    ? `${legacyPath.slice(0, -5)}.legacy-backup.json`
    : `${legacyPath}.legacy-backup.json`;
}

function removeSqliteFiles(databasePath: string): void {
  for (const path of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    if (existsSync(path)) {
      rmSync(path, { force: true });
    }
  }
}

function requiredString(value: unknown, label: string): string {
  const result = optionalString(value);
  if (!result) {
    throw new Error(`${label} is required`);
  }
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
