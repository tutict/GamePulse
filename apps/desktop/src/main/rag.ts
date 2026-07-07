import { ipcMain } from "electron";
import { getAllRawItems, type StoredRawItem } from "./database.js";

export interface RagEvidence {
  id: string;
  platform: string;
  sourceUrl?: string;
  sourceTitle?: string;
  body: string;
  excerpt: string;
  collectedAt: string;
  score: number;
}

export interface RagQueryInput {
  query?: string;
  limit?: number;
}

export interface RagQueryResult {
  query: string;
  answer: string;
  prompt: string;
  evidence: RagEvidence[];
  contextCharacterCount: number;
}

interface ScoredEvidence {
  item: StoredRawItem;
  score: number;
}

export function registerRagHandlers(): void {
  ipcMain.handle("rag:query", (_event, input: RagQueryInput) => runRagQuery(input));
}

export function runRagQuery(input: RagQueryInput): RagQueryResult {
  const query = normalizeWhitespace(input.query ?? "");

  if (!query) {
    throw new Error("RAG query is required");
  }

  const limit = clampLimit(input.limit ?? 8);
  const evidence = retrieveEvidence(query, limit);
  const context = buildContext(evidence);
  const prompt = buildPrompt(query, context);
  const answer = buildExtractiveAnswer(query, evidence);

  return {
    query,
    answer,
    prompt,
    evidence,
    contextCharacterCount: context.length
  };
}

function retrieveEvidence(query: string, limit: number): RagEvidence[] {
  const terms = tokenize(query).slice(0, 12);

  if (terms.length === 0) {
    return [];
  }

  return getAllRawItems()
    .map((item): ScoredEvidence => ({ item, score: scoreItem(item, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.item.collectedAt.localeCompare(a.item.collectedAt))
    .slice(0, limit)
    .map(({ item, score }) => ({
      id: item.id,
      platform: item.platform,
      sourceUrl: item.sourceUrl,
      sourceTitle: item.sourceTitle,
      body: item.body,
      excerpt: excerpt(item.body),
      collectedAt: item.collectedAt,
      score
    }));
}

function scoreItem(item: StoredRawItem, terms: string[]): number {
  const body = item.bodyNorm.toLowerCase();
  const title = (item.sourceTitle ?? "").toLowerCase();
  const platform = item.platform.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (body.includes(term)) {
      score += term.length >= 4 ? 4 : 2;
    }
    if (title.includes(term)) {
      score += 2;
    }
    if (platform.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function buildContext(evidence: RagEvidence[]): string {
  return evidence
    .map((item, index) => {
      const source = item.sourceUrl ? ` source=${item.sourceUrl}` : "";
      return `[E${index + 1}] platform=${item.platform}${source}\n${item.excerpt}`;
    })
    .join("\n\n");
}

function buildPrompt(query: string, context: string): string {
  return [
    "You are GamePulse's local RAG analyst for game community feedback.",
    "Answer in Chinese. Use only the evidence below. If the evidence is insufficient, say so directly.",
    "Cite evidence with [E1], [E2] style references. Do not invent platforms, dates, or player claims.",
    "",
    `Question: ${query}`,
    "",
    "Evidence:",
    context || "No matching evidence."
  ].join("\n");
}

function buildExtractiveAnswer(query: string, evidence: RagEvidence[]): string {
  if (evidence.length === 0) {
    return `No local evidence matched "${query}". Capture and save page rows first, then run the RAG query again.`;
  }

  const platforms = Array.from(new Set(evidence.map((item) => item.platform))).join(", ");
  const references = evidence.slice(0, 4).map((_, index) => `[E${index + 1}]`).join(" ");
  const topExcerpt = evidence[0]?.excerpt ?? "";

  return `Local RAG found ${evidence.length} relevant evidence rows across: ${platforms}. Top evidence: ${topExcerpt} ${references}`;
}

function tokenize(query: string): string[] {
  const normalized = normalizeWhitespace(query.toLowerCase());
  const latinTerms = normalized.match(/[a-z0-9_\-]{2,}/g) ?? [];
  const cjkTerms = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  const shortCjkTerms = cjkTerms.flatMap((term) => splitCjkTerm(term));
  return Array.from(new Set([...latinTerms, ...cjkTerms, ...shortCjkTerms])).filter((term) => term.length > 1);
}

function splitCjkTerm(term: string): string[] {
  if (term.length <= 4) {
    return [term];
  }

  const parts: string[] = [];
  for (let index = 0; index < term.length - 1; index += 2) {
    parts.push(term.slice(index, index + 2));
  }
  return parts;
}

function excerpt(value: string): string {
  const text = normalizeWhitespace(value);
  return text.length > 280 ? `${text.slice(0, 277)}...` : text;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clampLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 8;
  }

  return Math.max(1, Math.min(20, Math.floor(value)));
}
