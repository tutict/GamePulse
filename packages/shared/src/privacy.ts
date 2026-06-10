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

