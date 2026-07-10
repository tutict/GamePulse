import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import {
  buildFts5Query,
  buildRagContentHash,
  buildSearchTerms,
  hashAuthor,
  normalizeCommentText,
  sanitizeMetadata,
  type AnalysisLabel,
  type CommentRecord,
  type IngestItem,
  type LocalStore,
  type LocalStoreSearchInput,
  type LocalStoreStats,
  type LocalStoreWriteResult,
  type Project,
  type ProjectMergeResult,
  type ProjectSnapshot,
  type RagEvidenceCandidate,
  type Report
} from "@gamepulse/shared";

interface CommentRow {
  id: string;
  project_id: string;
  platform: string;
  source_url: string | null;
  source_title: string | null;
  external_id: string | null;
  author_hash: string | null;
  posted_at: string | null;
  collected_at: string;
  language: string | null;
  upvotes: number | null;
  replies: number | null;
  body: string;
  body_norm: string;
  content_hash: string;
  metadata_json: string;
  retrieval_score?: number;
}

interface ProjectRow {
  project_json: string;
}

interface CountRow {
  count: number;
}

interface LatestRow {
  latest: string | null;
}

const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        project_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        source_url TEXT,
        source_title TEXT,
        external_id TEXT,
        author_hash TEXT,
        posted_at TEXT,
        collected_at TEXT NOT NULL,
        language TEXT,
        upvotes INTEGER,
        replies INTEGER,
        body TEXT NOT NULL,
        body_norm TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        UNIQUE(project_id, platform, content_hash)
      );

      CREATE INDEX IF NOT EXISTS comments_project_collected_idx
        ON comments(project_id, collected_at DESC);
      CREATE INDEX IF NOT EXISTS comments_project_source_idx
        ON comments(project_id, source_url);

      CREATE VIRTUAL TABLE IF NOT EXISTS comments_fts USING fts5(
        body_norm,
        source_title,
        platform,
        content='comments',
        content_rowid='rowid',
        tokenize='unicode61 remove_diacritics 2'
      );

      CREATE TRIGGER IF NOT EXISTS comments_fts_insert AFTER INSERT ON comments BEGIN
        INSERT INTO comments_fts(rowid, body_norm, source_title, platform)
        VALUES (new.rowid, new.body_norm, COALESCE(new.source_title, ''), new.platform);
      END;

      CREATE TRIGGER IF NOT EXISTS comments_fts_delete AFTER DELETE ON comments BEGIN
        INSERT INTO comments_fts(comments_fts, rowid, body_norm, source_title, platform)
        VALUES ('delete', old.rowid, old.body_norm, COALESCE(old.source_title, ''), old.platform);
      END;

      CREATE TRIGGER IF NOT EXISTS comments_fts_update AFTER UPDATE ON comments BEGIN
        INSERT INTO comments_fts(comments_fts, rowid, body_norm, source_title, platform)
        VALUES ('delete', old.rowid, old.body_norm, COALESCE(old.source_title, ''), old.platform);
        INSERT INTO comments_fts(rowid, body_norm, source_title, platform)
        VALUES (new.rowid, new.body_norm, COALESCE(new.source_title, ''), new.platform);
      END;

      CREATE TABLE IF NOT EXISTS analysis_labels (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        label_json TEXT NOT NULL,
        PRIMARY KEY(project_id, comment_id)
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        report_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `
  }
] as const;

export class SqliteLocalStore implements LocalStore {
  private database: Database.Database | undefined;

  constructor(readonly databasePath: string) {}

  async initialize(): Promise<void> {
    if (this.database) {
      return;
    }

    if (this.databasePath !== ":memory:") {
      mkdirSync(dirname(this.databasePath), { recursive: true });
    }

    const database = new Database(this.databasePath);
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    if (this.databasePath !== ":memory:") {
      database.pragma("journal_mode = WAL");
      database.pragma("synchronous = NORMAL");
    }
    this.database = database;
    this.applyMigrations();
  }

  async close(): Promise<void> {
    this.database?.close();
    this.database = undefined;
  }

  async getStats(projectId?: string): Promise<LocalStoreStats> {
    const database = this.requireDatabase();
    const projectCount = projectId
      ? database.prepare("SELECT count(*) AS count FROM projects WHERE id = ?").get(projectId) as CountRow
      : database.prepare("SELECT count(*) AS count FROM projects").get() as CountRow;
    const commentCount = projectId
      ? database.prepare("SELECT count(*) AS count FROM comments WHERE project_id = ?").get(projectId) as CountRow
      : database.prepare("SELECT count(*) AS count FROM comments").get() as CountRow;
    const latest = projectId
      ? database.prepare("SELECT max(collected_at) AS latest FROM comments WHERE project_id = ?").get(projectId) as LatestRow
      : database.prepare("SELECT max(collected_at) AS latest FROM comments").get() as LatestRow;

    return {
      databasePath: this.databasePath,
      projectCount: projectCount.count,
      commentCount: commentCount.count,
      latestCollectedAt: latest.latest ?? undefined
    };
  }

  async listProjects(): Promise<Project[]> {
    const rows = this.requireDatabase()
      .prepare("SELECT project_json FROM projects ORDER BY updated_at DESC, id")
      .all() as ProjectRow[];
    return rows.map((row) => parseJson<Project>(row.project_json));
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    const row = this.requireDatabase()
      .prepare("SELECT project_json FROM projects WHERE id = ?")
      .get(projectId) as ProjectRow | undefined;
    return row ? parseJson<Project>(row.project_json) : undefined;
  }

  async saveProject(project: Project): Promise<void> {
    this.requireDatabase()
      .prepare(`
        INSERT INTO projects(id, name, description, project_json, created_at, updated_at)
        VALUES (@id, @name, @description, @projectJson, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          project_json = excluded.project_json,
          updated_at = excluded.updated_at
      `)
      .run({
        id: project.id,
        name: project.name,
        description: project.description ?? "",
        projectJson: JSON.stringify(project),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      });
  }

  async ingestComments(projectId: string, items: IngestItem[]): Promise<LocalStoreWriteResult> {
    const database = this.requireDatabase();
    const insert = database.prepare(`
      INSERT OR IGNORE INTO comments(
        id, project_id, platform, source_url, source_title, external_id, author_hash,
        posted_at, collected_at, language, upvotes, replies, body, body_norm,
        content_hash, metadata_json
      ) VALUES (
        @id, @projectId, @platform, @sourceUrl, @sourceTitle, @externalId, @authorHash,
        @postedAt, @collectedAt, @language, @upvotes, @replies, @body, @bodyNorm,
        @contentHash, @metadataJson
      )
    `);
    const collectedAt = new Date().toISOString();
    let inserted = 0;
    const ingest = database.transaction((rows: IngestItem[]) => {
      for (const item of rows) {
        const body = normalizeCommentText(item.body);
        if (!body) {
          continue;
        }

        const result = insert.run({
          id: randomUUID(),
          projectId,
          platform: item.platform,
          sourceUrl: item.sourceUrl ?? null,
          sourceTitle: item.sourceTitle ?? null,
          externalId: item.externalId ?? null,
          authorHash: hashAuthor(item) ?? null,
          postedAt: item.postedAt ?? null,
          collectedAt,
          language: item.language ?? null,
          upvotes: item.upvotes ?? null,
          replies: item.replies ?? null,
          body,
          bodyNorm: body.toLowerCase(),
          contentHash: buildRagContentHash({ ...item, body }),
          metadataJson: JSON.stringify(sanitizeMetadata(item.metadata))
        });
        inserted += result.changes;
      }
    });

    ingest(items);
    return { accepted: items.length, inserted };
  }

  async searchEvidence(input: LocalStoreSearchInput): Promise<RagEvidenceCandidate[]> {
    const database = this.requireDatabase();
    const limit = clampLimit(input.limit);
    const candidateLimit = Math.max(40, limit * 10);
    const byId = new Map<string, RagEvidenceCandidate>();
    const ftsQuery = buildFts5Query(input.query);

    if (ftsQuery) {
      const rows = database.prepare(`
        SELECT c.*, (100.0 - bm25(comments_fts, 1.0, 0.4, 0.2)) AS retrieval_score
        FROM comments_fts
        JOIN comments c ON c.rowid = comments_fts.rowid
        WHERE comments_fts MATCH ? AND c.project_id = ?
        ORDER BY bm25(comments_fts, 1.0, 0.4, 0.2), c.collected_at DESC
        LIMIT ?
      `).all(ftsQuery, input.projectId, candidateLimit) as CommentRow[];
      this.mergeSearchRows(byId, rows);
    }

    const terms = buildSearchTerms(input.query);
    if (terms.length > 0) {
      const predicates = terms.map(() => "(lower(body_norm) LIKE ? OR lower(COALESCE(source_title, '')) LIKE ?)").join(" OR ");
      const parameters = terms.flatMap((term) => [`%${escapeLike(term)}%`, `%${escapeLike(term)}%`]);
      const rows = database.prepare(`
        SELECT c.*, 20.0 AS retrieval_score
        FROM comments c
        WHERE c.project_id = ? AND (${predicates})
        ORDER BY c.collected_at DESC
        LIMIT ?
      `).all(input.projectId, ...parameters, candidateLimit) as CommentRow[];
      this.mergeSearchRows(byId, rows);
    }

    return Array.from(byId.values())
      .sort((a, b) => (b.retrievalScore ?? 0) - (a.retrievalScore ?? 0) || b.collectedAt.localeCompare(a.collectedAt))
      .slice(0, candidateLimit);
  }

  async exportProject(projectId: string): Promise<ProjectSnapshot> {
    const database = this.requireDatabase();
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const comments = (database.prepare("SELECT * FROM comments WHERE project_id = ? ORDER BY collected_at, id").all(projectId) as CommentRow[])
      .map(toCommentRecord);
    const labels = (database.prepare("SELECT label_json FROM analysis_labels WHERE project_id = ? ORDER BY comment_id").all(projectId) as Array<{ label_json: string }>)
      .map((row) => parseJson<AnalysisLabel>(row.label_json));
    const reports = (database.prepare("SELECT report_json FROM reports WHERE project_id = ? ORDER BY created_at, id").all(projectId) as Array<{ report_json: string }>)
      .map((row) => parseJson<Report>(row.report_json));

    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      project,
      comments,
      labels,
      reports
    };
  }

  async importProject(snapshot: ProjectSnapshot): Promise<ProjectMergeResult> {
    const database = this.requireDatabase();
    let inserted = 0;
    const merge = database.transaction(() => {
      this.saveProjectSync(snapshot.project);
      for (const comment of snapshot.comments) {
        inserted += this.insertCommentRecord(comment);
      }
      this.importLabels(snapshot.project.id, snapshot.labels);
      this.importReports(snapshot.project.id, snapshot.reports);
    });
    merge();

    return {
      projectId: snapshot.project.id,
      accepted: snapshot.comments.length,
      inserted,
      updated: 0
    };
  }

  private applyMigrations(): void {
    const database = this.requireDatabase();
    database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    const applied = new Set(
      (database.prepare("SELECT version FROM schema_migrations").all() as Array<{ version: number }>).map((row) => row.version)
    );

    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        continue;
      }
      database.transaction(() => {
        database.exec(migration.sql);
        database.prepare("INSERT INTO schema_migrations(version, applied_at) VALUES (?, ?)").run(
          migration.version,
          new Date().toISOString()
        );
      })();
    }
  }

  private mergeSearchRows(target: Map<string, RagEvidenceCandidate>, rows: CommentRow[]): void {
    for (const row of rows) {
      const candidate = toEvidenceCandidate(row);
      const current = target.get(candidate.id);
      if (!current || (candidate.retrievalScore ?? 0) > (current.retrievalScore ?? 0)) {
        target.set(candidate.id, candidate);
      }
    }
  }

  private saveProjectSync(project: Project): void {
    this.requireDatabase()
      .prepare(`
        INSERT INTO projects(id, name, description, project_json, created_at, updated_at)
        VALUES (@id, @name, @description, @projectJson, @createdAt, @updatedAt)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description,
          project_json = excluded.project_json,
          updated_at = excluded.updated_at
      `)
      .run({
        id: project.id,
        name: project.name,
        description: project.description ?? "",
        projectJson: JSON.stringify(project),
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      });
  }

  private insertCommentRecord(comment: CommentRecord): number {
    return this.requireDatabase()
      .prepare(`
        INSERT OR IGNORE INTO comments(
          id, project_id, platform, source_url, source_title, external_id, author_hash,
          posted_at, collected_at, language, upvotes, replies, body, body_norm,
          content_hash, metadata_json
        ) VALUES (
          @id, @projectId, @platform, @sourceUrl, @sourceTitle, @externalId, @authorHash,
          @postedAt, @collectedAt, @language, @upvotes, @replies, @body, @bodyNorm,
          @contentHash, @metadataJson
        )
      `)
      .run({
        id: comment.id,
        projectId: comment.projectId,
        platform: comment.platform,
        sourceUrl: comment.sourceUrl ?? null,
        sourceTitle: comment.sourceTitle ?? null,
        externalId: comment.externalId ?? null,
        authorHash: comment.authorHash ?? null,
        postedAt: comment.postedAt ?? null,
        collectedAt: comment.collectedAt,
        language: comment.language ?? null,
        upvotes: comment.upvotes ?? null,
        replies: comment.replies ?? null,
        body: comment.body,
        bodyNorm: comment.bodyNorm,
        contentHash: comment.contentHash,
        metadataJson: JSON.stringify(sanitizeMetadata(comment.metadata))
      }).changes;
  }

  private importLabels(projectId: string, labels: AnalysisLabel[]): void {
    const insert = this.requireDatabase().prepare(`
      INSERT INTO analysis_labels(project_id, comment_id, label_json)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id, comment_id) DO UPDATE SET label_json = excluded.label_json
    `);
    for (const label of labels) {
      insert.run(projectId, label.commentId, JSON.stringify(label));
    }
  }

  private importReports(projectId: string, reports: Report[]): void {
    const insert = this.requireDatabase().prepare(`
      INSERT INTO reports(id, project_id, report_json, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET report_json = excluded.report_json, created_at = excluded.created_at
    `);
    for (const report of reports) {
      insert.run(report.id, projectId, JSON.stringify(report), report.createdAt);
    }
  }

  private requireDatabase(): Database.Database {
    if (!this.database) {
      throw new Error("SqliteLocalStore is not initialized");
    }
    return this.database;
  }
}

function toEvidenceCandidate(row: CommentRow): RagEvidenceCandidate {
  return {
    id: row.id,
    platform: row.platform,
    sourceUrl: row.source_url ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    externalId: row.external_id ?? undefined,
    postedAt: row.posted_at ?? undefined,
    collectedAt: row.collected_at,
    body: row.body,
    contentHash: row.content_hash,
    retrievalScore: row.retrieval_score ?? 0
  };
}

function toCommentRecord(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    platform: row.platform as CommentRecord["platform"],
    sourceUrl: row.source_url ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    externalId: row.external_id ?? undefined,
    authorHash: row.author_hash ?? undefined,
    postedAt: row.posted_at ?? undefined,
    collectedAt: row.collected_at,
    language: row.language ?? undefined,
    upvotes: row.upvotes ?? undefined,
    replies: row.replies ?? undefined,
    body: row.body,
    bodyNorm: row.body_norm,
    contentHash: row.content_hash,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json)
  };
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 8;
  }
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function escapeLike(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
