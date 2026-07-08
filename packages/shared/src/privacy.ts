import type { IngestItem } from "./domain.js";

export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0");
}

export function hashAuthor(item: Pick<IngestItem, "platform" | "authorId" | "authorName" | "authorProfileUrl">): string | undefined {
  const identity = item.authorId ?? item.authorProfileUrl ?? item.authorName;

  if (!identity) {
    return undefined;
  }

  return stableHash(`${item.platform}:${normalizeWhitespace(identity).toLowerCase()}`);
}

export function buildContentHash(item: Pick<IngestItem, "platform" | "externalId" | "sourceUrl" | "body">): string {
  const body = normalizeWhitespace(item.body).toLowerCase();
  const stableIdentity = item.externalId ? `${item.platform}:${item.externalId}` : `${item.platform}:${item.sourceUrl ?? ""}:${body}`;
  return stableHash(stableIdentity);
}

export function excerpt(value: string, maxLength = 160): string {
  const normalized = normalizeWhitespace(value);

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}...`;
}



export function sanitizeMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (isSensitiveMetadataKey(key)) {
      continue;
    }

    if (isRecord(entry)) {
      const nested = sanitizeMetadata(entry);
      if (Object.keys(nested).length > 0) {
        sanitized[key] = nested;
      }
    } else if (Array.isArray(entry)) {
      sanitized[key] = entry
        .slice(0, 20)
        .map((item) => (isRecord(item) ? sanitizeMetadata(item) : sanitizeMetadataValue(item)))
        .filter((item) => item !== undefined);
    } else {
      const safeValue = sanitizeMetadataValue(entry);
      if (safeValue !== undefined) {
        sanitized[key] = safeValue;
      }
    }
  }

  return sanitized;
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > 2048 ? value.slice(0, 2048) : value;
  }

  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  return undefined;
}

function isSensitiveMetadataKey(key: string): boolean {
  return /author|avatar|nickname|nick|profile|user(name|id)?|uid|account|openid|email|phone|cookie|token|session/i.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

