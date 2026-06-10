import { parse } from "csv-parse/sync";
import type { IngestItem, Platform } from "@gamepulse/shared";
import { PLATFORMS } from "@gamepulse/shared";

type LooseRow = Record<string, unknown>;

const platformSet = new Set<string>(PLATFORMS);

export function parseImportPayload(format: "csv" | "json", content: string, defaultPlatform: Platform = "import"): IngestItem[] {
  const rows = format === "json" ? parseJsonRows(content) : parseCsvRows(content);
  return rows.map((row) => mapRowToIngestItem(row, defaultPlatform)).filter((item) => item.body.length > 0);
}

export function parseJsonRows(content: string): LooseRow[] {
  const parsed = JSON.parse(content) as unknown;

  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord);
  }

  if (isRecord(parsed) && Array.isArray(parsed.items)) {
    return parsed.items.filter(isRecord);
  }

  throw new Error("JSON import must be an array or an object with an items array");
}

export function parseCsvRows(content: string): LooseRow[] {
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true
  }) as LooseRow[];
}

export function mapRowToIngestItem(row: LooseRow, defaultPlatform: Platform): IngestItem {
  const platform = coercePlatform(first(row, ["platform", "source", "channel"]), defaultPlatform);
  const body =
    firstString(row, ["body", "content", "text", "comment", "review", "title", "message"]) ??
    "";

  return {
    platform,
    body,
    sourceUrl: firstString(row, ["sourceUrl", "source_url", "url", "link", "permalink"]),
    sourceTitle: firstString(row, ["sourceTitle", "source_title", "threadTitle", "title"]),
    externalId: firstString(row, ["externalId", "external_id", "id", "commentId", "reviewId"]),
    authorName: firstString(row, ["authorName", "author_name", "author", "user", "username"]),
    authorId: firstString(row, ["authorId", "author_id", "uid", "userId"]),
    authorProfileUrl: firstString(row, ["authorProfileUrl", "author_profile_url", "profileUrl"]),
    postedAt: firstString(row, ["postedAt", "posted_at", "createdAt", "created_at", "date", "time"]),
    language: firstString(row, ["language", "lang"]),
    upvotes: firstNumber(row, ["upvotes", "likes", "votes", "score"]),
    replies: firstNumber(row, ["replies", "replyCount", "comments"]),
    metadata: row
  };
}

function isRecord(value: unknown): value is LooseRow {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function first(row: LooseRow, keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  return undefined;
}

function firstString(row: LooseRow, keys: string[]): string | undefined {
  const value = first(row, keys);

  if (value === undefined) {
    return undefined;
  }

  return String(value).trim();
}

function firstNumber(row: LooseRow, keys: string[]): number | undefined {
  const value = first(row, keys);

  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function coercePlatform(value: unknown, fallback: Platform): Platform {
  const normalized = String(value ?? "").toLowerCase();
  const alias: Record<string, Platform> = {
    b站: "bilibili",
    bilibili: "bilibili",
    steam: "steam",
    nga: "nga",
    reddit: "reddit",
    taptap: "taptap",
    tap: "taptap",
    小黑盒: "heybox",
    heybox: "heybox",
    import: "import"
  };

  const platform = alias[normalized] ?? normalized;
  return platformSet.has(platform) ? (platform as Platform) : fallback;
}

