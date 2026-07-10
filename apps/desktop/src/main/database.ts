import { join } from "node:path";
import { app, ipcMain } from "electron";
import {
  PLATFORMS,
  type IngestItem,
  type Platform,
  type Project
} from "@gamepulse/shared";
import type { CollectorItem, CollectorResult } from "./collector.js";
import { migrateLegacyJsonStore } from "./legacyMigration.js";
import { assertTrustedIpcSender } from "./security.js";
import { SqliteLocalStore } from "./sqliteStore.js";

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

const collectorProjectId = "desktop-collector";
const platformSet = new Set<string>(PLATFORMS);
let store: SqliteLocalStore | undefined;

export function registerDatabaseHandlers(): void {
  ipcMain.handle("database:get-stats", async (event) => {
    assertTrustedIpcSender(event);
    return getDatabaseStats();
  });
  ipcMain.handle("database:save-collector-result", async (event, result: unknown) => {
    assertTrustedIpcSender(event);
    return saveCollectorResult(validateCollectorResult(result));
  });
}

export async function initializeDesktopDatabase(): Promise<void> {
  const userDataPath = app.getPath("userData");
  const databasePath = join(userDataPath, "gamepulse.db");
  const legacyPath = join(userDataPath, "gamepulse-store.json");

  try {
    await migrateLegacyJsonStore({ databasePath, legacyPath });
  } catch (error) {
    console.error("Legacy GamePulse JSON migration failed; preserving the original file.", error);
  }

  store = new SqliteLocalStore(databasePath);
  await store.initialize();
  await ensureCollectorProject(store);
}

export async function shutdownDesktopDatabase(): Promise<void> {
  await store?.close();
  store = undefined;
}

export function getDesktopStore(): SqliteLocalStore {
  if (!store) {
    throw new Error("Desktop database is not initialized");
  }
  return store;
}

async function saveCollectorResult(result: CollectorResult): Promise<SaveCollectorResult> {
  const currentStore = getDesktopStore();
  const writeResult = await currentStore.ingestComments(
    collectorProjectId,
    result.items.map((item) => toIngestItem(item, result))
  );
  const stats = await currentStore.getStats();

  return {
    accepted: writeResult.accepted,
    inserted: writeResult.inserted,
    databasePath: stats.databasePath ?? "",
    totalItems: stats.commentCount
  };
}

async function getDatabaseStats(): Promise<DatabaseStats> {
  const stats = await getDesktopStore().getStats();
  return {
    databasePath: stats.databasePath ?? "",
    projectCount: stats.projectCount,
    rawItemCount: stats.commentCount,
    latestCollectedAt: stats.latestCollectedAt
  };
}

async function ensureCollectorProject(currentStore: SqliteLocalStore): Promise<void> {
  if (await currentStore.getProject(collectorProjectId)) {
    return;
  }

  const now = new Date().toISOString();
  const project: Project = {
    id: collectorProjectId,
    name: "Desktop Collector",
    description: "Rows captured by the Electron bundled Chromium collector.",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: now,
    updatedAt: now
  };
  await currentStore.saveProject(project);
}

function toIngestItem(item: CollectorItem, result: CollectorResult): IngestItem {
  return {
    platform: parsePlatform(item.platform || result.platform),
    body: item.body,
    sourceUrl: item.sourceUrl || result.url || undefined,
    sourceTitle: item.sourceTitle || result.title || undefined,
    metadata: { selector: item.selector }
  };
}

function parsePlatform(value: string): Platform {
  const normalized = value.toLowerCase();
  return platformSet.has(normalized) ? normalized as Platform : "import";
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
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
