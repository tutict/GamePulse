import {
  buildNoEvidenceAnswer,
  buildRagContext,
  rerankEvidence,
  type LocalStore,
  type RagCitation,
  type RankedRagEvidence
} from "@gamepulse/shared";
import { RemoteModelGateway } from "../models/remoteModelGateway.js";
import { resolveRemoteModelConfig } from "../models/secureModelConfig.js";

export interface MobileRagResult {
  query: string;
  answer: string;
  prompt: string;
  evidence: RankedRagEvidence[];
  citations: RagCitation[];
  contextCharacterCount: number;
}

export async function runMobileRag(
  store: LocalStore,
  projectId: string,
  query: string,
  signal?: AbortSignal
): Promise<MobileRagResult> {
  const candidates = await store.searchEvidence({
    projectId,
    query,
    limit: 32
  });
  const evidence = rerankEvidence(query, candidates);
  const context = buildRagContext(evidence);
  if (!context.text) {
    return {
      query,
      answer: buildNoEvidenceAnswer(query),
      prompt: "",
      evidence: [],
      citations: [],
      contextCharacterCount: 0
    };
  }

  const prompt = buildPrompt(query, context.text);
  const config = await resolveRemoteModelConfig();
  const gateway = new RemoteModelGateway(config);
  let answer = "";
  for await (const event of gateway.stream({
    model: config.model,
    messages: [
      {
        role: "system",
        content: "You answer only from the provided evidence. Cite evidence with [E1], [E2], and so on. If evidence is insufficient, say so clearly."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.2,
    timeoutMs: 60_000,
    signal
  })) {
    if (event.type === "delta") {
      answer += event.text;
    }
  }

  return {
    query,
    answer: answer.trim(),
    prompt,
    evidence: context.evidence,
    citations: context.citations,
    contextCharacterCount: context.characterCount
  };
}

function buildPrompt(query: string, context: string): string {
  return [
    "Question:",
    query.trim(),
    "",
    "Evidence:",
    context,
    "",
    "Requirements:",
    "- Answer in the same language as the question.",
    "- Use only the evidence above.",
    "- Add citations such as [E1] after factual claims.",
    "- Do not invent metrics, causes, or user sentiment."
  ].join("\n");
}
