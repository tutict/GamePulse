import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection
} from "@capacitor-community/sqlite";
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
  type ResearchRecord,
  type Report
} from "@gamepulse/shared";

export interface MobileSqlDriver {
  open(): Promise<void>;
  close(): Promise<void>;
  execute(statements: string): Promise<void>;
  run(statement: string, values?: unknown[]): Promise<number>;
  query<T extends Record<string, unknown>>(statement: string, values?: unknown[]): Promise<T[]>;
  transaction<T>(operation: () => Promise<T>): Promise<T>;
}

export class CapacitorSqliteDriver implements MobileSqlDriver {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  private connection: SQLiteDBConnection | undefined;

  constructor(private readonly databaseName = "gamepulse-mobile") {}

  async open(): Promise<void> {
    if (this.connection) {
      return;
    }
    const connection = await this.sqlite.createConnection(
      this.databaseName,
      false,
      "no-encryption",
      1,
      false
    );
    await connection.open();
    this.connection = connection;
  }

  async close(): Promise<void> {
    if (!this.connection) {
      return;
    }
    await this.connection.close();
    await this.sqlite.closeConnection(this.databaseName, false);
    this.connection = undefined;
  }

  async execute(statements: string): Promise<void> {
    await this.requireConnection().execute(statements, false);
  }

  async run(statement: string, values: unknown[] = []): Promise<number> {
    const result = await this.requireConnection().run(statement, values, false);
    return result.changes?.changes ?? 0;
  }

  async query<T extends Record<string, unknown>>(
    statement: string,
    values: unknown[] = []
  ): Promise<T[]> {
    const result = await this.requireConnection().query(statement, values);
    return (result.values ?? []) as T[];
  }

  async transaction<T>(operation: () => Promise<T>): Promise<T> {
    const connection = this.requireConnection();
    await connection.beginTransaction();
    try {
      const result = await operation();
      await connection.commitTransaction();
      return result;
    } catch (error) {
      await connection.rollbackTransaction();
      throw error;
    }
  }

  private requireConnection(): SQLiteDBConnection {
    if (!this.connection) {
      throw new Error("Mobile SQLite connection is not initialized");
    }
    return this.connection;
  }
}

const schema = `
  PRAGMA foreign_keys = ON;

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

  CREATE TABLE IF NOT EXISTS researches (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    research_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS researches_updated_idx
    ON researches(updated_at DESC);

  INSERT OR IGNORE INTO schema_migrations(version, applied_at)
  VALUES (1, datetime('now'));
  INSERT OR IGNORE INTO schema_migrations(version, applied_at)
  VALUES (2, datetime('now'));
`;

interface CountRow extends Record<string, unknown> {
  count: number;
}

interface LatestRow extends Record<string, unknown> {
  latest: string | null;
}

interface JsonRow extends Record<string, unknown> {
  value: string;
}

interface CommentRow extends Record<string, unknown> {
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

export class CapacitorSqliteLocalStore implements LocalStore {
  private initialized = false;

  constructor(private readonly driver: MobileSqlDriver = new CapacitorSqliteDriver()) {}

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    await this.driver.open();
    await this.driver.execute(schema);
    this.initialized = true;
  }

  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    await this.driver.close();
    this.initialized = false;
  }

  async getStats(projectId?: string): Promise<LocalStoreStats> {
    this.requireInitialized();
    const where = projectId ? " WHERE id = ?" : "";
    const projectValues = projectId ? [projectId] : [];
    const commentWhere = projectId ? " WHERE project_id = ?" : "";
    const commentValues = projectId ? [projectId] : [];
    const [projectCount] = await this.driver.query<CountRow>(
      `SELECT count(*) AS count FROM projects${where}`,
      projectValues
    );
    const [commentCount] = await this.driver.query<CountRow>(
      `SELECT count(*) AS count FROM comments${commentWhere}`,
      commentValues
    );
    const [latest] = await this.driver.query<LatestRow>(
      `SELECT max(collected_at) AS latest FROM comments${commentWhere}`,
      commentValues
    );
    return {
      projectCount: projectCount?.count ?? 0,
      commentCount: commentCount?.count ?? 0,
      latestCollectedAt: latest?.latest ?? undefined
    };
  }

  async listProjects(): Promise<Project[]> {
    this.requireInitialized();
    const rows = await this.driver.query<JsonRow>(
      "SELECT project_json AS value FROM projects ORDER BY updated_at DESC, id"
    );
    return rows.map((row) => JSON.parse(row.value) as Project);
  }

  async getProject(projectId: string): Promise<Project | undefined> {
    this.requireInitialized();
    const [row] = await this.driver.query<JsonRow>(
      "SELECT project_json AS value FROM projects WHERE id = ?",
      [projectId]
    );
    return row ? JSON.parse(row.value) as Project : undefined;
  }

  async saveProject(project: Project): Promise<void> {
    this.requireInitialized();
    await this.saveProjectRow(project);
  }

  async listResearches(): Promise<ResearchRecord[]> {
    this.requireInitialized();
    const rows = await this.driver.query<JsonRow>(
      "SELECT research_json AS value FROM researches ORDER BY updated_at DESC, id"
    );
    return rows.map((row) => JSON.parse(row.value) as ResearchRecord);
  }

  async getResearch(researchId: string): Promise<ResearchRecord | undefined> {
    this.requireInitialized();
    const [row] = await this.driver.query<JsonRow>(
      "SELECT research_json AS value FROM researches WHERE id = ?",
      [researchId]
    );
    return row ? JSON.parse(row.value) as ResearchRecord : undefined;
  }

  async saveResearch(research: ResearchRecord): Promise<void> {
    this.requireInitialized();
    await this.driver.run(
      `INSERT INTO researches(id, status, research_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         status = excluded.status,
         research_json = excluded.research_json,
         updated_at = excluded.updated_at`,
      [
        research.id,
        research.status,
        JSON.stringify(research),
        research.createdAt,
        research.updatedAt
      ]
    );
  }

  async ingestComments(projectId: string, items: IngestItem[]): Promise<LocalStoreWriteResult> {
    this.requireInitialized();
    const acceptedItems = items
      .map((item) => ({ ...item, body: normalizeCommentText(item.body) }))
      .filter((item) => item.body.length > 0);
    let inserted = 0;
    await this.driver.transaction(async () => {
      for (const item of acceptedItems) {
        inserted += await this.insertComment(projectId, toCommentRecord(projectId, item));
      }
    });
    return { accepted: acceptedItems.length, inserted };
  }

  async searchEvidence(input: LocalStoreSearchInput): Promise<RagEvidenceCandidate[]> {
    this.requireInitialized();
    const limit = Math.max(1, Math.min(100, input.limit ?? 32));
    const rows = new Map<string, RagEvidenceCandidate>();
    const ftsQuery = buildFts5Query(input.query);
    if (ftsQuery) {
      const ftsRows = await this.driver.query<CommentRow>(
        `SELECT c.*, (-bm25(comments_fts) + 1.0) AS retrieval_score
         FROM comments_fts
         JOIN comments c ON c.rowid = comments_fts.rowid
         WHERE c.project_id = ? AND comments_fts MATCH ?
         ORDER BY bm25(comments_fts), c.collected_at DESC
         LIMIT ?`,
        [input.projectId, ftsQuery, limit]
      );
      mergeCandidates(rows, ftsRows);
    }

    const terms = buildSearchTerms(input.query).slice(0, 6);
    if (terms.length > 0) {
      const predicates = terms.map(() => "(body_norm LIKE ? OR source_title LIKE ?)").join(" OR ");
      const values = terms.flatMap((term) => [`%${term}%`, `%${term}%`]);
      const likeRows = await this.driver.query<CommentRow>(
        `SELECT c.*, 1.0 AS retrieval_score
         FROM comments c
         WHERE c.project_id = ? AND (${predicates})
         ORDER BY c.collected_at DESC
         LIMIT ?`,
        [input.projectId, ...values, limit]
      );
      mergeCandidates(rows, likeRows);
    }

    return Array.from(rows.values())
      .sort((left, right) =>
        (right.retrievalScore ?? 0) - (left.retrievalScore ?? 0)
        || right.collectedAt.localeCompare(left.collectedAt)
      )
      .slice(0, limit);
  }

  async exportProject(projectId: string): Promise<ProjectSnapshot> {
    this.requireInitialized();
    const project = await this.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }
    const comments = (await this.driver.query<CommentRow>(
      "SELECT * FROM comments WHERE project_id = ? ORDER BY collected_at, id",
      [projectId]
    )).map(toComment);
    const labels = (await this.driver.query<JsonRow>(
      "SELECT label_json AS value FROM analysis_labels WHERE project_id = ? ORDER BY comment_id",
      [projectId]
    )).map((row) => JSON.parse(row.value) as AnalysisLabel);
    const reports = (await this.driver.query<JsonRow>(
      "SELECT report_json AS value FROM reports WHERE project_id = ? ORDER BY created_at, id",
      [projectId]
    )).map((row) => JSON.parse(row.value) as Report);
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
    this.requireInitialized();
    let inserted = 0;
    await this.driver.transaction(async () => {
      await this.saveProjectRow(snapshot.project);
      for (const comment of snapshot.comments) {
        inserted += await this.insertComment(snapshot.project.id, comment);
      }
      for (const label of snapshot.labels) {
        await this.driver.run(
          `INSERT OR REPLACE INTO analysis_labels(project_id, comment_id, label_json)
           VALUES (?, ?, ?)`,
          [snapshot.project.id, label.commentId, JSON.stringify(label)]
        );
      }
      for (const report of snapshot.reports) {
        await this.driver.run(
          `INSERT OR REPLACE INTO reports(id, project_id, report_json, created_at)
           VALUES (?, ?, ?, ?)`,
          [report.id, snapshot.project.id, JSON.stringify(report), report.createdAt]
        );
      }
    });
    return {
      projectId: snapshot.project.id,
      accepted: snapshot.comments.length,
      inserted,
      updated: 0
    };
  }

  private async saveProjectRow(project: Project): Promise<void> {
    await this.driver.run(
      `INSERT INTO projects(id, name, description, project_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         description = excluded.description,
         project_json = excluded.project_json,
         updated_at = excluded.updated_at`,
      [
        project.id,
        project.name,
        project.description ?? "",
        JSON.stringify(project),
        project.createdAt,
        project.updatedAt
      ]
    );
  }

  private async insertComment(projectId: string, comment: CommentRecord): Promise<number> {
    return this.driver.run(
      `INSERT OR IGNORE INTO comments(
         id, project_id, platform, source_url, source_title, external_id, author_hash,
         posted_at, collected_at, language, upvotes, replies, body, body_norm,
         content_hash, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        comment.id,
        projectId,
        comment.platform,
        comment.sourceUrl ?? null,
        comment.sourceTitle ?? null,
        comment.externalId ?? null,
        comment.authorHash ?? null,
        comment.postedAt ?? null,
        comment.collectedAt,
        comment.language ?? null,
        comment.upvotes ?? null,
        comment.replies ?? null,
        comment.body,
        comment.bodyNorm,
        comment.contentHash,
        JSON.stringify(sanitizeMetadata(comment.metadata))
      ]
    );
  }

  private requireInitialized(): void {
    if (!this.initialized) {
      throw new Error("Mobile local store is not initialized");
    }
  }
}

function toCommentRecord(projectId: string, item: IngestItem): CommentRecord {
  const bodyNorm = normalizeCommentText(item.body);
  return {
    ...item,
    id: globalThis.crypto.randomUUID(),
    projectId,
    body: bodyNorm,
    bodyNorm,
    contentHash: buildRagContentHash({ ...item, body: bodyNorm }),
    authorHash: hashAuthor(item),
    collectedAt: new Date().toISOString(),
    metadata: sanitizeMetadata(item.metadata)
  };
}

function toComment(row: CommentRow): CommentRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    platform: row.platform as CommentRecord["platform"],
    body: row.body,
    bodyNorm: row.body_norm,
    contentHash: row.content_hash,
    collectedAt: row.collected_at,
    sourceUrl: row.source_url ?? undefined,
    sourceTitle: row.source_title ?? undefined,
    externalId: row.external_id ?? undefined,
    authorHash: row.author_hash ?? undefined,
    postedAt: row.posted_at ?? undefined,
    language: row.language ?? undefined,
    upvotes: row.upvotes ?? undefined,
    replies: row.replies ?? undefined,
    metadata: JSON.parse(row.metadata_json) as Record<string, unknown>
  };
}

function toCandidate(row: CommentRow): RagEvidenceCandidate {
  const comment = toComment(row);
  return {
    id: comment.id,
    platform: comment.platform,
    body: comment.body,
    contentHash: comment.contentHash,
    collectedAt: comment.collectedAt,
    sourceUrl: comment.sourceUrl,
    sourceTitle: comment.sourceTitle,
    externalId: comment.externalId,
    postedAt: comment.postedAt,
    retrievalScore: row.retrieval_score
  };
}

function mergeCandidates(target: Map<string, RagEvidenceCandidate>, rows: CommentRow[]): void {
  for (const row of rows) {
    const candidate = toCandidate(row);
    const current = target.get(candidate.id);
    if (!current || (candidate.retrievalScore ?? 0) > (current.retrievalScore ?? 0)) {
      target.set(candidate.id, candidate);
    }
  }
}
