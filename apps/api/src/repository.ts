import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { from as copyFrom } from "pg-copy-streams";
import type { PoolClient, QueryResultRow } from "pg";
import type { EntityAlias, IngestItem, Platform, Project, SourceLink, VersionWindow } from "@gamepulse/shared";
import { buildContentHash, detectLanguage, hashAuthor, normalizeWhitespace, sanitizeMetadata } from "@gamepulse/shared";
import { query, withTransaction } from "./db.js";

export interface CreateProjectInput {
  name: string;
  description?: string;
  steamAppId?: string;
  redditSubreddits?: string[];
  redditKeywords?: string[];
  sourceLinks?: SourceLink[];
  versionWindows?: VersionWindow[];
  entityAliases?: EntityAlias[];
}

export interface InsertResult {
  accepted: number;
  inserted: number;
}

export async function listProjects(): Promise<Project[]> {
  const result = await query("SELECT * FROM projects ORDER BY created_at DESC");
  return result.rows.map(rowToProject);
}

export async function getProject(projectId: string): Promise<Project | undefined> {
  const result = await query("SELECT * FROM projects WHERE id = $1", [projectId]);
  return result.rows[0] ? rowToProject(result.rows[0]) : undefined;
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const result = await query(
    `INSERT INTO projects (
      id, name, description, steam_app_id, reddit_subreddits, reddit_keywords,
      source_links, version_windows, entity_aliases, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
    RETURNING *`,
    [
      id,
      input.name,
      input.description,
      input.steamAppId,
      JSON.stringify(input.redditSubreddits ?? []),
      JSON.stringify(input.redditKeywords ?? []),
      JSON.stringify(input.sourceLinks ?? []),
      JSON.stringify(input.versionWindows ?? []),
      JSON.stringify(input.entityAliases ?? []),
      now
    ]
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Project insert did not return a row");
  }

  return rowToProject(row);
}

export async function insertIngestItems(projectId: string, items: IngestItem[]): Promise<InsertResult> {
  const cleanItems = items.map((item) => normalizeIngestItem(item)).filter((item) => item.bodyNorm.length > 0);
  if (cleanItems.length === 0) return { accepted: items.length, inserted: 0 };
  let inserted = 0;
  for (let index = 0; index < cleanItems.length; index += 10_000) {
    inserted += await insertChunk(projectId, cleanItems.slice(index, index + 10_000));
  }
  return { accepted: items.length, inserted };
}

function normalizeIngestItem(item: IngestItem): IngestItem & { bodyNorm: string; authorHash?: string; contentHash: string } {
  const bodyNorm = normalizeWhitespace(item.body);
  const normalized: IngestItem = { ...item, body: bodyNorm, language: item.language ?? detectLanguage(bodyNorm), metadata: sanitizeMetadata(item.metadata) };
  return { ...normalized, bodyNorm, authorHash: hashAuthor(normalized), contentHash: buildContentHash(normalized) };
}

async function insertChunk(projectId: string, items: Array<IngestItem & { bodyNorm: string; authorHash?: string; contentHash: string }>): Promise<number> {
  return withTransaction(async (client) => {
    await client.query(`CREATE TEMP TABLE ingest_staging (
      id TEXT, project_id TEXT, platform TEXT, source_url TEXT, source_title TEXT, external_id TEXT,
      body TEXT, body_norm TEXT, author_hash TEXT, posted_at TIMESTAMPTZ, language TEXT,
      upvotes INTEGER, replies INTEGER, content_hash TEXT, metadata JSONB
    ) ON COMMIT DROP`);
    const copy = client.query(copyFrom(`COPY ingest_staging (
      id,project_id,platform,source_url,source_title,external_id,body,body_norm,author_hash,posted_at,
      language,upvotes,replies,content_hash,metadata
    ) FROM STDIN WITH (FORMAT csv, NULL '\\N')`));
    const csv = items.map((item) => [randomUUID(), projectId, item.platform, item.sourceUrl, item.sourceTitle, item.externalId,
      item.body, item.bodyNorm, item.authorHash, item.postedAt ? new Date(item.postedAt).toISOString() : null,
      item.language, item.upvotes ?? null, item.replies ?? null, item.contentHash, JSON.stringify(item.metadata ?? {})]
      .map(csvField).join(",")).join("\n") + "\n";
    await pipeline(Readable.from([csv]), copy);
    const result = await client.query(`INSERT INTO raw_items (
      id,project_id,platform,source_url,source_title,external_id,body,body_norm,author_hash,posted_at,
      language,upvotes,replies,content_hash,metadata
    ) SELECT id,project_id,platform,source_url,source_title,external_id,body,body_norm,author_hash,posted_at,
      language,upvotes,replies,content_hash,metadata FROM ingest_staging
      ON CONFLICT (project_id,platform,content_hash) DO NOTHING`);
    return result.rowCount ?? 0;
  });
}

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "\\N";
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function rowToProject(row: QueryResultRow): Project {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    steamAppId: row.steam_app_id as string | undefined,
    redditSubreddits: row.reddit_subreddits as string[],
    redditKeywords: row.reddit_keywords as string[],
    sourceLinks: row.source_links as SourceLink[],
    versionWindows: row.version_windows as VersionWindow[],
    entityAliases: row.entity_aliases as EntityAlias[],
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

export function parsePlatform(value: unknown): Platform | undefined {
  const platform = String(value ?? "") as Platform;
  return ["bilibili", "steam", "nga", "reddit", "taptap", "heybox", "import"].includes(platform) ? platform : undefined;
}
