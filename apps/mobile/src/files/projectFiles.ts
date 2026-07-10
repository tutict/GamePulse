import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FilePicker, type PickedFile } from "@capawesome/capacitor-file-picker";
import {
  GamePulseProjectPackageCodec,
  PLATFORMS,
  type IngestItem,
  type LocalStore,
  type Platform,
  type Project,
  type ProjectMergeResult
} from "@gamepulse/shared";

const packageCodec = new GamePulseProjectPackageCodec();
const platforms = new Set<string>(PLATFORMS);

export interface ImportFileResult {
  fileName: string;
  projectId: string;
  accepted: number;
  inserted: number;
}

export async function pickAndImportFile(
  store: LocalStore,
  selectedProjectId?: string
): Promise<ImportFileResult | undefined> {
  let result;
  try {
    result = await FilePicker.pickFiles({ limit: 1, readData: true });
  } catch (error) {
    if (String(error).toLowerCase().includes("cancel")) {
      return undefined;
    }
    throw error;
  }
  const file = result.files[0];
  if (!file) {
    return undefined;
  }
  const bytes = await readPickedFile(file);
  const extension = file.name.toLowerCase().split(".").pop() ?? "";
  if (extension === "gamepulse") {
    const merge = await store.importProject(await packageCodec.decode(bytes));
    return toImportResult(file.name, merge);
  }

  const text = new TextDecoder().decode(bytes);
  const projectId = selectedProjectId ?? await ensureImportProject(store, file.name);
  const items = parseImportText(extension, text);
  const write = await store.ingestComments(projectId, items);
  return {
    fileName: file.name,
    projectId,
    ...write
  };
}

export async function exportAndShareProject(
  store: LocalStore,
  projectId: string
): Promise<string> {
  const snapshot = await store.exportProject(projectId);
  const bytes = await packageCodec.encode(snapshot);
  const fileName = `${safeFileName(snapshot.project.name)}.gamepulse`;

  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/zip" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    return fileName;
  }

  const result = await Filesystem.writeFile({
    path: `exports/${fileName}`,
    data: bytesToBase64(bytes),
    directory: Directory.Cache,
    recursive: true
  });
  await Share.share({
    title: snapshot.project.name,
    text: "GamePulse project package",
    files: [result.uri],
    dialogTitle: "Share GamePulse project"
  });
  return fileName;
}

function parseImportText(extension: string, text: string): IngestItem[] {
  if (extension === "ndjson" || extension === "jsonl") {
    return text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => toIngestItem(JSON.parse(line) as unknown));
  }
  if (extension === "csv") {
    return parseCsv(text).map(toIngestItem);
  }
  if (extension === "json") {
    const value = JSON.parse(text) as unknown;
    const rows = Array.isArray(value)
      ? value
      : isRecord(value) && Array.isArray(value.items)
        ? value.items
        : isRecord(value) && Array.isArray(value.comments)
          ? value.comments
          : [value];
    return rows.map(toIngestItem);
  }
  throw new Error(`Unsupported import file: .${extension || "unknown"}`);
}

function toIngestItem(value: unknown): IngestItem {
  if (!isRecord(value)) {
    throw new Error("Import row must be an object");
  }
  const body = firstString(value.body, value.comment, value.text, value.content);
  if (!body) {
    throw new Error("Import row is missing body/comment/text");
  }
  return {
    platform: parsePlatform(firstString(value.platform, value.source)),
    body,
    sourceUrl: optionalString(value.sourceUrl, value.url, value.link),
    sourceTitle: optionalString(value.sourceTitle, value.title),
    externalId: optionalString(value.externalId, value.id),
    postedAt: optionalString(value.postedAt, value.createdAt, value.date),
    language: optionalString(value.language, value.lang),
    upvotes: optionalNumber(value.upvotes, value.score, value.likes),
    replies: optionalNumber(value.replies, value.replyCount),
    metadata: isRecord(value.metadata) ? value.metadata : {}
  };
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === "\"") {
      if (quoted && text[index + 1] === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.length > 0)) {
    rows.push(row);
  }
  const headers = rows.shift()?.map((value) => value.trim()) ?? [];
  return rows.map((values) => Object.fromEntries(
    headers.map((header, index) => [header, values[index]?.trim() ?? ""])
  ));
}

async function readPickedFile(file: PickedFile): Promise<Uint8Array> {
  if (file.blob) {
    return new Uint8Array(await file.blob.arrayBuffer());
  }
  if (file.data) {
    return base64ToBytes(file.data);
  }
  if (file.path) {
    const response = await fetch(file.path);
    if (!response.ok) {
      throw new Error(`Unable to read ${file.name}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  throw new Error(`File picker did not provide data for ${file.name}`);
}

async function ensureImportProject(store: LocalStore, fileName: string): Promise<string> {
  const now = new Date().toISOString();
  const project: Project = {
    id: globalThis.crypto.randomUUID(),
    name: fileName.replace(/\.[^.]+$/, "") || "Imported project",
    description: "Imported on Android",
    redditSubreddits: [],
    redditKeywords: [],
    sourceLinks: [],
    versionWindows: [],
    entityAliases: [],
    createdAt: now,
    updatedAt: now
  };
  await store.saveProject(project);
  return project.id;
}

function toImportResult(fileName: string, result: ProjectMergeResult): ImportFileResult {
  return {
    fileName,
    projectId: result.projectId,
    accepted: result.accepted,
    inserted: result.inserted
  };
}

function parsePlatform(value: string): Platform {
  const normalized = value.toLowerCase();
  return platforms.has(normalized) ? normalized as Platform : "import";
}

function firstString(...values: unknown[]): string {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? "";
}

function optionalString(...values: unknown[]): string | undefined {
  return firstString(...values) || undefined;
}

function optionalNumber(...values: unknown[]): number | undefined {
  const value = values.find((item) =>
    typeof item === "number" || (typeof item === "string" && item.trim())
  );
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function safeFileName(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim() || "gamepulse-project";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
