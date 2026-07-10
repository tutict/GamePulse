import {
  buildNoEvidenceAnswer,
  buildRagContext,
  normalizeCommentText,
  rerankEvidence,
  type LocalStore,
  type RankedRagEvidence
} from "@gamepulse/shared";

export interface RagQueryInput {
  query?: string;
  limit?: number;
  projectId?: string;
}

export interface RagQueryResult {
  query: string;
  answer: string;
  prompt: string;
  evidence: RankedRagEvidence[];
  contextCharacterCount: number;
}

export async function runLocalRagQuery(
  store: Pick<LocalStore, "searchEvidence">,
  input: RagQueryInput
): Promise<RagQueryResult> {
  const query = normalizeCommentText(input.query ?? "");
  if (!query) {
    throw new Error("RAG query is required");
  }

  const limit = clampLimit(input.limit);
  const candidates = await store.searchEvidence({
    projectId: input.projectId ?? "desktop-collector",
    query,
    limit: Math.max(40, limit * 10)
  });
  const ranked = rerankEvidence(query, candidates, { limit });
  const context = buildRagContext(ranked);

  return {
    query,
    answer: buildAnswer(query, context.evidence),
    prompt: buildPrompt(query, context.text),
    evidence: context.evidence,
    contextCharacterCount: context.characterCount
  };
}

function buildPrompt(query: string, context: string): string {
  return [
    "You are GamePulse's local RAG analyst for game community feedback.",
    "Answer in Chinese and use only the evidence below.",
    "If the evidence is insufficient, say so directly.",
    "Cite evidence with [E1], [E2] references and never invent player claims.",
    "",
    `Question: ${query}`,
    "",
    "Evidence:",
    context || "No matching evidence."
  ].join("\n");
}

function buildAnswer(query: string, evidence: RankedRagEvidence[]): string {
  if (evidence.length === 0) {
    return buildNoEvidenceAnswer(query);
  }

  const platforms = Array.from(new Set(evidence.map((item) => item.platform))).join("、");
  const references = evidence.map((_, index) => `[E${index + 1}]`).join(" ");
  const topExcerpt = evidence[0]?.excerpt ?? "";
  return `找到 ${evidence.length} 条本地证据，来源平台：${platforms}。最相关反馈：${topExcerpt} ${references}`;
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) {
    return 8;
  }
  return Math.max(1, Math.min(20, Math.floor(value)));
}
