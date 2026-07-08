import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { app, ipcMain } from "electron";
import type { CollectorItem, CollectorResult } from "./collector.js";
import { assertTrustedIpcSender } from "./security.js";

export interface StoredRawItem {
  id: string;
  projectId: string;
  platform: string;
  sourceUrl?: string;
  sourceTitle?: string;
  body: string;
  bodyNorm: string;
  collectedAt: string;
  contentHash: string;
  metadata: Record<string, unknown>;
}

interface StoredProject {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface DesktopStoreFile {
  version: 1;
  projects: StoredProject[];
  rawItems: StoredRawItem[];
}

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

let store: DesktopStoreFile | undefined;

export function registerDatabaseHandlers(): void {
  ipcMain.handle("database:get-stats", (event) => {
    assertTrustedIpcSender(event);
    return getDatabaseStats();
  });
  ipcMain.handle("database:save-collector-result", (event, result: unknown) => {
    assertTrustedIpcSender(event);
    return saveCollectorResult(validateCollectorResult(result));
  });
}

export function initializeDesktopDatabase(): void {
  void getDesktopStore();
}

export function getDesktopStore(): DesktopStoreFile {
  if (!store) {
    const databasePath = getDatabasePath();
    mkdirSync(dirname(databasePath), { recursive: true });
    store = readStore(databasePath);
    persistStore();
  }

  return store;
}

export function getAllRawItems(): StoredRawItem[] {
  return getDesktopStore().rawItems;
}

export function getRecentRawItems(limit: number): StoredRawItem[] {
  const items = getDesktopStore().rawItems;
  return items.length > limit ? items.slice(items.length - limit) : items;
}

function getDatabasePath(): string {
  return join(app.getPath("userData"), "gamepulse-store.json");
}

function readStore(databasePath: string): DesktopStoreFile {
  if (!existsSync(databasePath)) {
    return createEmptyStore();
  }

  try {
    const parsed = JSON.parse(readFileSync(databasePath, "utf8")) as Partial<DesktopStoreFile>;
    return {
      version: 1,
      projects: Array.isArray(parsed.projects) ? parsed.projects.map(validateStoredProject) : [],
      rawItems: Array.isArray(parsed.rawItems) ? parsed.rawItems.map(validateStoredRawItem).filter((item): item is StoredRawItem => Boolean(item)) : []
    };
  } catch {
    return createEmptyStore();
  }
}

function createEmptyStore(): DesktopStoreFile {
  return { version: 1, projects: [], rawItems: [] };
}

function persistStore(): void {
  const current = getDesktopStore();
  const databasePath = getDatabasePath();
  const temporaryPath = `${databasePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(current, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, databasePath);
}

function saveCollectorResult(result: CollectorResult): SaveCollectorResult {
  const current = getDesktopStore();
  const projectId = ensureCollectorProject(current);
  const now = new Date().toISOString();
  const existingHashes = new Set(current.rawItems.map((item) => `${item.projectId}\u001f${item.platform}\u001f${item.contentHash}`));
  let inserted = 0;

  for (const item of result.items) {
    const bodyNorm = normalizeWhitespace(item.body);
    if (!bodyNorm) {
      continue;
    }

    const platform = item.platform || result.platform || "import";
    const contentHashValue = contentHash({ ...item, platform });
    const uniqueKey = `${projectId}\u001f${platform}\u001f${contentHashValue}`;

    if (existingHashes.has(uniqueKey)) {
      continue;
    }

    current.rawItems.push({
      id: randomUUID(),
      projectId,
      platform,
      sourceUrl: item.sourceUrl || result.url || undefined,
      sourceTitle: item.sourceTitle || result.title || undefined,
      body: bodyNorm,
      bodyNorm,
      collectedAt: now,
      contentHash: contentHashValue,
      metadata: { selector: item.selector }
    });
    existingHashes.add(uniqueKey);
    inserted += 1;
  }

  if (inserted > 0) {
    persistStore();
  }

  const stats = getDatabaseStats();

  return {
    accepted: result.items.length,
    inserted,
    databasePath: stats.databasePath,
    totalItems: stats.rawItemCount
  };
}

function getDatabaseStats(): DatabaseStats {
  const current = getDesktopStore();
  const latestCollectedAt = current.rawItems
    .map((item) => item.collectedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return {
    databasePath: getDatabasePath(),
    projectCount: current.projects.length,
    rawItemCount: current.rawItems.length,
    latestCollectedAt
  };
}

function ensureCollectorProject(current: DesktopStoreFile): string {
  const id = "desktop-collector";
  const existing = current.projects.find((project) => project.id === id);

  if (existing) {
    return existing.id;
  }

  const now = new Date().toISOString();
  current.projects.push({
    id,
    name: "Desktop Collector",
    description: "Rows captured by the Electron bundled Chromium collector.",
    createdAt: now,
    updatedAt: now
  });
  persistStore();
  return id;
}

function validateStoredProject(value: unknown): StoredProject {
  if (!isRecord(value)) {
    const now = new Date().toISOString();
    return { id: randomUUID(), name: "Imported Project", description: "", createdAt: now, updatedAt: now };
  }

  const now = new Date().toISOString();
  return {
    id: asString(value.id) || randomUUID(),
    name: asString(value.name) || "Imported Project",
    description: asString(value.description),
    createdAt: asString(value.createdAt) || now,
    updatedAt: asString(value.updatedAt) || now
  };
}

function validateStoredRawItem(value: unknown): StoredRawItem | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const body = normalizeWhitespace(asString(value.body));
  if (!body) {
    return undefined;
  }

  const platform = asString(value.platform) || "import";
  const sourceUrl = asString(value.sourceUrl) || undefined;
  return {
    id: asString(value.id) || randomUUID(),
    projectId: asString(value.projectId) || "desktop-collector",
    platform,
    sourceUrl,
    sourceTitle: asString(value.sourceTitle) || undefined,
    body,
    bodyNorm: normalizeWhitespace(asString(value.bodyNorm) || body),
    collectedAt: asString(value.collectedAt) || new Date().toISOString(),
    contentHash: asString(value.contentHash) || createHash("sha256").update([platform, sourceUrl, body].join("\u001f")).digest("hex"),
    metadata: isRecord(value.metadata) ? value.metadata : {}
  };
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
