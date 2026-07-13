import {
  buildRagContext,
  rerankEvidence,
  DEFAULT_RAG_CONTEXT_CHARACTERS,
  DEFAULT_RAG_EVIDENCE_LIMIT,
  DEFAULT_RAG_SOURCE_LIMIT
} from "../rag.js";
import type { ResearchEvidence, ResearchRecord } from "./types.js";

export interface ResearchFollowUpCitation {
  id: string;
  label: string;
  evidenceId: string;
  sourceId: string;
  platform: string;
  sourceTitle: string;
  sourceUrl: string;
  postedAt: string;
  excerpt: string;
}

export interface ResearchFollowUpResult {
  question: string;
  context: string;
  prompt: string;
  fallbackAnswer: string;
  citations: ResearchFollowUpCitation[];
}

export function buildResearchFollowUp(input: {
  research: ResearchRecord;
  question: string;
  maxEvidence?: number;
  maxPerSource?: number;
  maxCharacters?: number;
}): ResearchFollowUpResult {
  const question = input.question.trim();
  if (!question) {
    throw new Error("Follow-up question is required");
  }

  const excluded = new Set(input.research.exclusions.map((item) => item.evidenceId));
  const available = input.research.evidence.filter((item) => !excluded.has(item.id));
  const byId = new Map(available.map((item) => [item.id, item]));
  const ranked = rerankEvidence(
    question,
    available.map((item) => ({
      id: item.id,
      platform: item.platform,
      body: item.body,
      contentHash: item.id,
      collectedAt: item.postedAt,
      sourceUrl: item.sourceUrl,
      sourceTitle: item.sourceTitle,
      postedAt: item.postedAt,
      retrievalScore: item.relevance,
      sentiment: item.sentiment
    })),
    {
      limit: input.maxEvidence ?? DEFAULT_RAG_EVIDENCE_LIMIT,
      maxPerSource: input.maxPerSource ?? DEFAULT_RAG_SOURCE_LIMIT
    }
  );
  const context = buildRagContext(
    ranked,
    input.maxCharacters ?? DEFAULT_RAG_CONTEXT_CHARACTERS
  );
  const citations = context.citations.flatMap((citation) => {
    const evidence = byId.get(citation.commentId);
    return evidence ? [toFollowUpCitation(citation.label, citation.excerpt, evidence)] : [];
  });
  const fallbackAnswer = buildFallbackAnswer(citations);
  const prompt = [
    "你是游戏舆论研究助手。只依据以下当前研究证据回答，不联网，不补充未提供的事实。",
    "所有事实判断必须使用 [E#] 引用；证据不足时明确说明，不要把固定样本比例外推为全体玩家意见。",
    `研究游戏：${input.research.request.gameName}`,
    input.research.request.focus ? `研究重点：${input.research.request.focus}` : "",
    `用户问题：${question}`,
    "",
    "当前研究证据：",
    context.text || "（没有可用证据）"
  ]
    .filter((line) => line !== "")
    .join("\n");

  return {
    question,
    context: context.text,
    prompt,
    fallbackAnswer,
    citations
  };
}

function toFollowUpCitation(
  label: string,
  excerpt: string,
  evidence: ResearchEvidence
): ResearchFollowUpCitation {
  return {
    id: label.slice(1, -1),
    label,
    evidenceId: evidence.id,
    sourceId: evidence.sourceId,
    platform: evidence.platform,
    sourceTitle: evidence.sourceTitle,
    sourceUrl: evidence.sourceUrl,
    postedAt: evidence.postedAt,
    excerpt
  };
}

function buildFallbackAnswer(citations: ResearchFollowUpCitation[]): string {
  if (citations.length === 0) {
    return "当前研究没有可用证据，无法基于本地材料回答这个问题。";
  }

  const points = citations
    .slice(0, 3)
    .map((citation) => `${citation.excerpt} ${citation.label}`)
    .join("；");
  return `基于当前研究的固定样本，可以先确认：${points}。如需更精确的判断，应继续核查这些来源，而不是把样本结论外推到全部玩家。`;
}