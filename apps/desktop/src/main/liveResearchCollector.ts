import { createHash } from "node:crypto";
import type {
  ResearchCollector,
  ResearchEvidence,
  ResearchRequest,
  ResearchSentiment,
  ResearchSource
} from "@gamepulse/shared";

const maxSources = 8;
const maxEvidencePerSource = 30;

const preferredHosts = [
  "store.steampowered.com",
  "steamcommunity.com",
  "taptap.cn",
  "bilibili.com",
  "reddit.com",
  "tieba.baidu.com",
  "nga.cn",
  "keylol.com",
  "heybox.com"
];

const blockedHosts = new Set([
  "bing.com",
  "www.bing.com",
  "duckduckgo.com",
  "www.google.com",
  "google.com",
  "baidu.com",
  "www.baidu.com"
]);

const positiveTerms = [
  "推荐", "好评", "优秀", "好玩", "有趣", "惊喜", "流畅", "稳定", "喜欢", "值得",
  "recommend", "great", "excellent", "fun", "love", "smooth", "stable", "worth"
];

const negativeTerms = [
  "差评", "不推荐", "失望", "卡顿", "闪退", "崩溃", "断线", "延迟", "无聊", "退款",
  "bug", "crash", "disconnect", "lag", "stutter", "boring", "refund", "broken", "disappoint"
];

export interface ResearchSearchResult {
  title: string;
  url: string;
}

export interface SteamSearchItem {
  id: number;
  name: string;
}

export interface ResearchPageItem {
  body: string;
  postedAt?: string;
  sentiment?: "positive" | "neutral" | "negative";
}

export interface ResearchPageCapture {
  title: string;
  url: string;
  platform: string;
  publishedAt?: string;
  items: ResearchPageItem[];
}

export interface ResearchPageReader {
  search(query: string, signal?: AbortSignal): Promise<ResearchSearchResult[]>;
  capture(url: string, signal?: AbortSignal): Promise<ResearchPageCapture>;
}

export function selectSteamSearchItems(
  items: SteamSearchItem[],
  gameName: string
): SteamSearchItem[] {
  const normalizedGame = normalizeComparable(gameName);
  const exact = items.filter((item) => normalizeComparable(item.name) === normalizedGame);
  return exact.length > 0 ? exact.slice(0, 1) : items.slice(0, 3);
}

export class LiveResearchCollector implements ResearchCollector {
  constructor(
    private readonly reader: ResearchPageReader,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  async collect(
    request: ResearchRequest,
    signal?: AbortSignal
  ): Promise<{ sources: ResearchSource[]; evidence: ResearchEvidence[] }> {
    const searchErrors: string[] = [];
    const candidates: ResearchSearchResult[] = [];

    for (const query of buildSearchQueries(request)) {
      throwIfAborted(signal);
      try {
        candidates.push(...await this.reader.search(query, signal));
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw error;
        }
        searchErrors.push(errorMessage(error));
      }
    }

    const rankedCandidates = selectCandidates(candidates, request.gameName);
    const sources: ResearchSource[] = [];
    const evidence: ResearchEvidence[] = [];
    const seenContent = new Set<string>();

    for (const candidate of rankedCandidates) {
      throwIfAborted(signal);
      const sourceId = stableId("source", candidate.url);
      try {
        const capture = await this.reader.capture(candidate.url, signal);
        const sourceUrl = normalizeCandidateUrl(capture.url) || candidate.url;
        const sourceEvidence = normalizeEvidence({
          capture: { ...capture, url: sourceUrl },
          candidate,
          request,
          sourceId,
          now: this.now,
          seenContent
        }).slice(0, maxEvidencePerSource);
        evidence.push(...sourceEvidence);
        sources.push({
          id: sourceId,
          platform: capture.platform || platformFromUrl(capture.url),
          title: capture.title || candidate.title,
          url: sourceUrl,
          status: sourceEvidence.length > 0 ? "covered" : "excluded",
          itemCount: sourceEvidence.length
        });
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw error;
        }
        sources.push({
          id: sourceId,
          platform: platformFromUrl(candidate.url),
          title: candidate.title,
          url: candidate.url,
          status: "failed",
          itemCount: 0,
          error: errorMessage(error)
        });
      }
    }

    if (rankedCandidates.length === 0) {
      sources.push({
        id: stableId("source", `search:${request.gameName}`),
        platform: "web-search",
        title: `${request.gameName} 公开来源搜索`,
        url: "https://www.bing.com/",
        status: "failed",
        itemCount: 0,
        error: searchErrors.length > 0
          ? `未发现可采集页面：${searchErrors.join("；")}`
          : "未发现与目标游戏明确相关的公开页面。"
      });
    }

    return { sources, evidence };
  }
}

function buildSearchQueries(request: ResearchRequest): string[] {
  const focus = request.focus ? ` ${request.focus}` : "";
  return [
    `"${request.gameName}" 玩家评价 口碑 讨论${focus}`,
    `"${request.gameName}" player reviews discussion${focus}`
  ];
}

function selectCandidates(
  candidates: ResearchSearchResult[],
  gameName: string
): ResearchSearchResult[] {
  const seen = new Set<string>();
  return candidates
    .map((candidate) => ({
      title: cleanText(candidate.title).slice(0, 300),
      url: normalizeCandidateUrl(candidate.url)
    }))
    .filter((candidate): candidate is ResearchSearchResult => Boolean(candidate.url && candidate.title))
    .filter((candidate) => {
      if (seen.has(candidate.url)) {
        return false;
      }
      seen.add(candidate.url);
      return isGameRelated(candidate.title, gameName);
    })
    .sort((left, right) => candidateScore(right, gameName) - candidateScore(left, gameName))
    .slice(0, maxSources);
}

function normalizeCandidateUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.hostname.endsWith("duckduckgo.com") && parsed.searchParams.get("uddg")) {
      return normalizeCandidateUrl(parsed.searchParams.get("uddg") ?? "");
    }
    if (parsed.hostname.endsWith("bing.com")) {
      const encodedTarget = parsed.searchParams.get("u");
      if (encodedTarget?.startsWith("a1")) {
        return normalizeCandidateUrl(
          Buffer.from(encodedTarget.slice(2), "base64url").toString("utf8")
        );
      }
      return "";
    }
    if (!isPublicHttpUrl(parsed)) {
      return "";
    }
    parsed.hash = "";
    for (const parameter of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "token",
      "access_token",
      "auth",
      "key",
      "signature",
      "sig",
      "solution",
      "js_challenge",
      "jsc_orig_r",
      "ref",
      "ref_source"
    ]) {
      parsed.searchParams.delete(parameter);
    }
    return parsed.href;
  } catch {
    return "";
  }
}

function isPublicHttpUrl(url: URL): boolean {
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    blockedHosts.has(url.hostname)
  ) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return false;
  }
  if (host.startsWith("[")) {
    return false;
  }
  if (/^(?:127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)) {
    return false;
  }
  return !/\.(?:zip|exe|msi|dmg|apk|pdf)$/i.test(url.pathname);
}

function isGameRelated(title: string, gameName: string): boolean {
  const normalizedTitle = normalizeComparable(title);
  const normalizedGame = normalizeComparable(gameName);
  if (normalizedTitle.includes(normalizedGame)) {
    return true;
  }
  const tokens = gameTokens(gameName);
  return tokens.length > 0 && tokens.every((token) => normalizedTitle.includes(token));
}

function candidateScore(candidate: ResearchSearchResult, gameName: string): number {
  const host = safeHostname(candidate.url);
  const preferredIndex = preferredHosts.findIndex((preferred) => host === preferred || host.endsWith(`.${preferred}`));
  return (isGameRelated(candidate.title, gameName) ? 100 : 0)
    + (preferredIndex >= 0 ? 30 - preferredIndex : 0)
    + (/review|评价|评论|口碑|讨论/i.test(candidate.title) ? 10 : 0);
}

function normalizeEvidence(input: {
  capture: ResearchPageCapture;
  candidate: ResearchSearchResult;
  request: ResearchRequest;
  sourceId: string;
  now: () => string;
  seenContent: Set<string>;
}): ResearchEvidence[] {
  const sourceTitle = cleanText(input.capture.title || input.candidate.title).slice(0, 500);
  const sourceUrl = input.capture.url || input.candidate.url;
  const platform = input.capture.platform || platformFromUrl(sourceUrl);
  if (!isGameRelated(`${sourceTitle} ${input.candidate.title}`, input.request.gameName)) {
    return [];
  }

  const result: ResearchEvidence[] = [];
  for (const item of input.capture.items) {
    const body = cleanText(item.body);
    if (!looksLikeEvidence(body)) {
      continue;
    }
    const contentKey = normalizeComparable(body);
    if (input.seenContent.has(contentKey)) {
      continue;
    }
    const relevance = calculateRelevance(body, sourceTitle, input.request);
    if (relevance < 0.55) {
      continue;
    }
    const publishedAt = validDate(item.postedAt) ?? validDate(input.capture.publishedAt);
    input.seenContent.add(contentKey);
    result.push({
      id: stableId("evidence", `${sourceUrl}\n${contentKey}`),
      sourceId: input.sourceId,
      platform,
      sourceUrl,
      sourceTitle,
      body: body.slice(0, 2_000),
      excerpt: truncateAtWord(body, 280),
      postedAt: publishedAt ?? input.now(),
      dateEstimated: !publishedAt,
      sentiment: item.sentiment ?? classifySentiment(body),
      relevance
    });
  }
  return result.sort((left, right) => right.relevance - left.relevance || left.id.localeCompare(right.id));
}

function calculateRelevance(body: string, sourceTitle: string, request: ResearchRequest): number {
  let score = isGameRelated(sourceTitle, request.gameName) ? 0.7 : 0.35;
  if (isGameRelated(body, request.gameName)) {
    score += 0.2;
  }
  if (request.focus && sharesMeaningfulToken(body, request.focus)) {
    score += 0.1;
  }
  return Math.min(1, Number(score.toFixed(2)));
}

function sharesMeaningfulToken(text: string, focus: string): boolean {
  const haystack = normalizeComparable(text);
  return gameTokens(focus).some((token) => haystack.includes(token));
}

function looksLikeEvidence(body: string): boolean {
  if (body.length < 18 || body.length > 2_000) {
    return false;
  }
  if (/^(登录|注册|首页|菜单|隐私|cookie|sign in|log in|subscribe|advertisement)(?:\s|$)/i.test(body)) {
    return false;
  }
  return /[\u3400-\u9fff]/.test(body) || body.split(/\s+/).length >= 5;
}

function classifySentiment(body: string): Exclude<ResearchSentiment, "mixed"> {
  const normalized = body.toLowerCase();
  const positive = positiveTerms.reduce((count, term) => count + occurrences(normalized, term), 0);
  const negative = negativeTerms.reduce((count, term) => count + occurrences(normalized, term), 0);
  if (positive > negative) {
    return "positive";
  }
  if (negative > positive) {
    return "negative";
  }
  return "neutral";
}

function occurrences(value: string, term: string): number {
  let count = 0;
  let position = value.indexOf(term);
  while (position >= 0) {
    count += 1;
    position = value.indexOf(term, position + term.length);
  }
  return count;
}

function platformFromUrl(rawUrl: string): string {
  const host = safeHostname(rawUrl);
  if (host.includes("steam")) return "steam";
  if (host.includes("taptap")) return "taptap";
  if (host.includes("bilibili")) return "bilibili";
  if (host.includes("reddit")) return "reddit";
  if (host.includes("tieba")) return "tieba";
  if (host.includes("nga")) return "nga";
  if (host.includes("heybox")) return "heybox";
  return "public-web";
}

function gameTokens(value: string): string[] {
  const normalized = value.normalize("NFKC").toLowerCase();
  const latin = normalized.match(/[a-z0-9]{2,}/g) ?? [];
  const chinese = normalized.match(/[\u3400-\u9fff]{2,}/g) ?? [];
  return [...new Set([...latin, ...chinese])];
}

function normalizeComparable(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

function cleanText(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  const candidate = value.slice(0, maxLength - 1);
  const boundary = Math.max(candidate.lastIndexOf(" "), candidate.lastIndexOf("。"));
  const truncated = boundary > maxLength / 2 ? candidate.slice(0, boundary + 1) : candidate;
  return `${truncated.trim()}…`;
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function validDate(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function safeHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Research cancelled", "AbortError");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
