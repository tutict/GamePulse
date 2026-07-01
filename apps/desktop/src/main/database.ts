import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { app, ipcMain } from "electron";
import type { CollectorItem, CollectorResult } from "./collector.js";

interface SaveCollectorResult {
  accepted: number;
  inserted: number;
  databasePath: string;
  totalItems: number;
}

interface DatabaseStats {
  databasePath: string;
  projectCount: number;
  rawItemCount: number;
  latestCollectedAt?: string;
}

let database: Database.Database | undefined;

export function registerDatabaseHandlers(): void {
  ipcMain.handle("database:get-stats", () => getDatabaseStats());
  ipcMain.handle("database:save-collector-result", (_event, result: unknown) => saveCollectorResult(validateCollectorResult(result)));
}

export function initializeDesktopDatabase(): void {
  const db = getDesktopDatabase();
  migrate(db);
}

export function getDesktopDatabase(): Database.Database {
  if (!database) {
    const databasePath = getDatabasePath();
    mkdirSync(dirname(databasePath), { recursive: true });
    database = new Database(databasePath);
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    migrate(database);
  }

  return database;
}

function getDatabasePath(): string {
  return join(app.getPath("userData"), "gamepulse.sqlite3");
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      source_links TEXT NOT NULL DEFAULT '[]',
      version_windows TEXT NOT NULL DEFAULT '[]',
      entity_aliases TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS raw_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      source_url TEXT,
      source_title TEXT,
      body TEXT NOT NULL,
      body_norm TEXT NOT NULL,
      collected_at TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      UNIQUE(project_id, platform, content_hash)
    );

    CREATE INDEX IF NOT EXISTS raw_items_project_collected_idx ON raw_items(project_id, collected_at DESC);
    CREATE INDEX IF NOT EXISTS raw_items_project_platform_idx ON raw_items(project_id, platform);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  ensureFtsSchema(db);
}

function ensureFtsSchema(db: Database.Database): void {
  const ftsColumns = db.prepare("PRAGMA table_info(raw_items_fts)").all() as Array<{ name: string }>;
  const hasExpectedSchema = ftsColumns.some((column) => column.name === "raw_item_id");

  if (!hasExpectedSchema) {
    db.exec("DROP TABLE IF EXISTS raw_items_fts");
  }

  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS raw_items_fts USING fts5(
      raw_item_id UNINDEXED,
      body,
      source_title,
      platform UNINDEXED,
      source_url UNINDEXED
    );
  `);

  const ftsCount = db.prepare("SELECT count(*) AS count FROM raw_items_fts").get() as { count: number };
  const rawCount = db.prepare("SELECT count(*) AS count FROM raw_items").get() as { count: number };

  if (rawCount.count > 0 && ftsCount.count === 0) {
    db.exec(`
      INSERT INTO raw_items_fts (raw_item_id, body, source_title, platform, source_url)
      SELECT id, body, source_title, platform, source_url FROM raw_items;
    `);
  }
}

function saveCollectorResult(result: CollectorResult): SaveCollectorResult {
  const db = getDesktopDatabase();
  const projectId = ensureCollectorProject(db);
  const now = new Date().toISOString();
  const insertItem = db.prepare(`
    INSERT OR IGNORE INTO raw_items (
      id, project_id, platform, source_url, source_title, body, body_norm, collected_at, content_hash, metadata
    ) VALUES (
      @id, @projectId, @platform, @sourceUrl, @sourceTitle, @body, @bodyNorm, @collectedAt, @contentHash, @metadata
    )
  `);
  const insertFts = db.prepare(`
    INSERT INTO raw_items_fts (raw_item_id, body, source_title, platform, source_url)
    VALUES (@id, @body, @sourceTitle, @platform, @sourceUrl)
  `);

  const transaction = db.transaction((items: CollectorItem[]) => {
    let inserted = 0;

    for (const item of items) {
      const bodyNorm = normalizeWhitespace(item.body);
      if (!bodyNorm) {
        continue;
      }

      const row = {
        id: randomUUID(),
        projectId,
        platform: item.platform || result.platform || "import",
        sourceUrl: item.sourceUrl || result.url,
        sourceTitle: item.sourceTitle || result.title,
        body: bodyNorm,
        bodyNorm,
        collectedAt: now,
        contentHash: contentHash(item),
        metadata: JSON.stringify({ selector: item.selector })
      };

      const outcome = insertItem.run(row);
      if (outcome.changes > 0) {
        insertFts.run(row);
        inserted += 1;
      }
    }

    return inserted;
  });

  const inserted = transaction(result.items);
  const stats = getDatabaseStats();

  return {
    accepted: result.items.length,
    inserted,
    databasePath: stats.databasePath,
    totalItems: stats.rawItemCount
  };
}

function getDatabaseStats(): DatabaseStats {
  const db = getDesktopDatabase();
  const projectCount = db.prepare("SELECT count(*) AS count FROM projects").get() as { count: number };
  const rawItemCount = db.prepare("SELECT count(*) AS count FROM raw_items").get() as { count: number };
  const latest = db.prepare("SELECT max(collected_at) AS latestCollectedAt FROM raw_items").get() as { latestCollectedAt?: string | null };

  return {
    databasePath: getDatabasePath(),
    projectCount: Number(projectCount.count),
    rawItemCount: Number(rawItemCount.count),
    latestCollectedAt: latest.latestCollectedAt ?? undefined
  };
}

function ensureCollectorProject(db: Database.Database): string {
  const id = "desktop-collector";
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR IGNORE INTO projects (
      id, name, description, source_links, version_windows, entity_aliases, created_at, updated_at
    ) VALUES (
      @id, @name, @description, '[]', '[]', '[]', @now, @now
    )
  `).run({
    id,
    name: "Desktop Collector",
    description: "Rows captured by the Electron bundled Chromium collector.",
    now
  });

  return id;
}

function validateCollectorResult(value: unknown): CollectorResult {
  if (!isRecord(value)) {
    throw new Error("Collector result must be an object");
  }

  const items = Array.isArray(value.items) ? value.items.slice(0, 500) : [];

  return {
    url: asString(value.url),
    title: asString(value.title),
    platform: asString(value.platform) || "import",
    itemCount: items.length,
    items: items.map(validateCollectorItem).filter((item) => item.body.length > 0)
  };
}

function validateCollectorItem(value: unknown): CollectorItem {
  if (!isRecord(value)) {
    return { body: "", platform: "import", sourceUrl: "", sourceTitle: "", selector: "" };
  }

  return {
    body: truncate(asString(value.body), 5000),
    platform: truncate(asString(value.platform) || "import", 40),
    sourceUrl: truncate(asString(value.sourceUrl), 2048),
    sourceTitle: truncate(asString(value.sourceTitle), 512),
    selector: truncate(asString(value.selector), 512)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function contentHash(item: CollectorItem): string {
  return createHash("sha256")
    .update([item.platform, item.sourceUrl, normalizeWhitespace(item.body)].join("\u001f"))
    .digest("hex");
}
