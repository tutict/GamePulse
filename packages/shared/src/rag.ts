import { excerpt, normalizeWhitespace, stableHash } from "./privacy.js";

const fts5Operators = new Set(["and", "or", "not", "near"]);
const minimumContextBlockCharacters = 80;
const contextSeparator = "\n\n";

export const DEFAULT_RAG_EVIDENCE_LIMIT = 8;
export const DEFAULT_RAG_SOURCE_LIMIT = 2;
export const DEFAULT_RAG_CONTEXT_CHARACTERS = 12_000;

export interface RagContentIdentity {
  platform: string;
  body: string;
  sourceUrl?: string;
  externalId?: string;
}

export interface RagEvidenceCandidate extends RagContentIdentity {
  id: string;
  contentHash: string;
  collectedAt: string;
  sourceTitle?: string;
  postedAt?: string;
  retrievalScore?: number;
  sentiment?: string;
  severity?: number;
}

export interface RankedRagEvidence extends RagEvidenceCandidate {
  bodyNorm: string;
  excerpt: string;
  score: number;
}

export interface RerankEvidenceOptions {
  limit?: number;
  maxPerSource?: number;
}

export interface RagCitation {
  id: string;
  label: string;
  commentId: string;
  platform: string;
  sourceUrl?: string;
  postedAt?: string;
  excerpt: string;
}

export interface RagContext {
  text: string;
  characterCount: number;
  evidence: RankedRagEvidence[];
  citations: RagCitation[];
}

export function normalizeCommentText(value: string): string {
  return normalizeWhitespace(value.normalize("NFKC"));
}

export function buildRagContentHash(item: RagContentIdentity): string {
  const platform = normalizeCommentText(item.platform).toLowerCase();
  const externalId = normalizeCommentText(item.externalId ?? "");
  const sourceUrl = normalizeCommentText(item.sourceUrl ?? "");
  const body = normalizeCommentText(item.body).toLowerCase();
  const identity = externalId ? `${platform}:${externalId}` : `${platform}:${sourceUrl}:${body}`;
  return stableHash(identity);
}

export function buildSearchTerms(query: string, maxTerms = 12): string[] {
  const normalized = normalizeCommentText(query).toLowerCase();
  const latinTerms = (normalized.match(/[a-z0-9][a-z0-9_-]+/g) ?? []).filter(
    (term) => !fts5Operators.has(term)
  );
  const cjkTerms = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? [];

  return Array.from(new Set([...latinTerms, ...cjkTerms])).slice(0, Math.max(0, maxTerms));
}

export function buildFts5Query(query: string, maxTerms = 12): string {
  return buildSearchTerms(query, maxTerms)
    .map((term) => `"${term.replaceAll('"', '""')}"`)
    .join(" OR ");
}

export function rerankEvidence(
  query: string,
  candidates: RagEvidenceCandidate[],
  options: RerankEvidenceOptions = {}
): RankedRagEvidence[] {
  const terms = buildSearchTerms(query);
  const limit = clampPositiveInteger(options.limit, DEFAULT_RAG_EVIDENCE_LIMIT);
  const maxPerSource = clampPositiveInteger(options.maxPerSource, DEFAULT_RAG_SOURCE_LIMIT);
  const ranked = candidates
    .map((candidate) => rankCandidate(candidate, terms))
    .filter((candidate) => candidate.score > 0)
    .sort(compareRankedEvidence);
  const accepted: RankedRagEvidence[] = [];
  const seenHashes = new Set<string>();
  const sourceCounts = new Map<string, number>();

  for (const candidate of ranked) {
    const contentHash = candidate.contentHash || buildRagContentHash(candidate);
    if (seenHashes.has(contentHash)) {
      continue;
    }

    const sourceKey = candidate.sourceUrl ?? candidate.sourceTitle ?? `${candidate.platform}:${candidate.id}`;
    const sourceCount = sourceCounts.get(sourceKey) ?? 0;
    if (sourceCount >= maxPerSource) {
      continue;
    }

    seenHashes.add(contentHash);
    sourceCounts.set(sourceKey, sourceCount + 1);
    accepted.push({ ...candidate, contentHash });
    if (accepted.length >= limit) {
      break;
    }
  }

  return accepted;
}

export function createEvidenceCitations(evidence: RankedRagEvidence[]): RagCitation[] {
  return evidence.map((item, index) => ({
    id: `E${index + 1}`,
    label: `[E${index + 1}]`,
    commentId: item.id,
    platform: item.platform,
    sourceUrl: item.sourceUrl,
    postedAt: item.postedAt,
    excerpt: item.excerpt
  }));
}

export function buildRagContext(
  evidence: RankedRagEvidence[],
  maxCharacters = DEFAULT_RAG_CONTEXT_CHARACTERS
): RagContext {
  const budget = Math.max(0, Math.floor(maxCharacters));
  if (budget === 0 || evidence.length === 0) {
    return { text: "", characterCount: 0, evidence: [], citations: [] };
  }

  const targetCount = Math.max(
    1,
    Math.min(evidence.length, Math.floor(budget / minimumContextBlockCharacters))
  );
  const includedEvidence = evidence.slice(0, targetCount);
  const separatorCharacters = contextSeparator.length * Math.max(0, targetCount - 1);
  const blockBudget = Math.max(1, Math.floor((budget - separatorCharacters) / targetCount));
  const blocks = includedEvidence.map((item, index) => buildContextBlock(item, index, blockBudget));
  const text = blocks.join(contextSeparator).slice(0, budget);

  return {
    text,
    characterCount: text.length,
    evidence: includedEvidence,
    citations: createEvidenceCitations(includedEvidence)
  };
}

export function buildNoEvidenceAnswer(query: string): string {
  const normalized = normalizeWhitespace(query.normalize("NFC"));
  return `没有找到与“${normalized}”匹配的本地证据。请先导入或采集相关评论后重试。`;
}

function rankCandidate(candidate: RagEvidenceCandidate, terms: string[]): RankedRagEvidence {
  const bodyNorm = normalizeCommentText(candidate.body);
  const body = bodyNorm.toLowerCase();
  const title = normalizeCommentText(candidate.sourceTitle ?? "").toLowerCase();
  const platform = normalizeCommentText(candidate.platform).toLowerCase();
  let lexicalScore = 0;

  for (const term of terms) {
    if (body.includes(term)) {
      lexicalScore += 1;
    }
    if (title.includes(term)) {
      lexicalScore += 0.5;
    }
    if (platform.includes(term)) {
      lexicalScore += 0.25;
    }
  }

  return {
    ...candidate,
    body: bodyNorm,
    bodyNorm,
    excerpt: excerpt(bodyNorm, 280),
    score: Math.max(0, candidate.retrievalScore ?? 0) * 10 + lexicalScore
  };
}

function buildContextBlock(item: RankedRagEvidence, index: number, blockBudget: number): string {
  const label = `[E${index + 1}]`;
  const metadata = [
    `platform=${item.platform}`,
    item.postedAt ? `postedAt=${item.postedAt}` : "",
    item.sourceUrl ? `source=${item.sourceUrl}` : ""
  ]
    .filter(Boolean)
    .join(" ");
  const preferredHeader = `${label} ${metadata}`;
  const header = preferredHeader.length < blockBudget ? preferredHeader : `${label} ${item.platform}`;
  const bodyBudget = Math.max(0, blockBudget - header.length - 1);
  const body = excerpt(item.excerpt, bodyBudget);
  return body ? `${header}\n${body}`.slice(0, blockBudget) : header.slice(0, blockBudget);
}

function compareRankedEvidence(a: RankedRagEvidence, b: RankedRagEvidence): number {
  return b.score - a.score || b.collectedAt.localeCompare(a.collectedAt) || a.id.localeCompare(b.id);
}

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}
