import { describe, expect, it } from "vitest";
import { buildRagContext, rerankEvidence, type RagEvidenceCandidate } from "./rag.js";

describe("RAG context building", () => {
  it("trims context to the character budget and keeps citations aligned", () => {
    const candidates: RagEvidenceCandidate[] = [
      candidate("one", "a".repeat(90), 3),
      candidate("two", "b".repeat(90), 2),
      candidate("three", "c".repeat(90), 1)
    ];
    const ranked = rerankEvidence("aaa bbb ccc", candidates);
    const context = buildRagContext(ranked, 170);

    expect(context.characterCount).toBeLessThanOrEqual(170);
    expect(context.text).toContain("[E1]");
    expect(context.citations.map((citation) => citation.label)).toEqual(["[E1]", "[E2]"]);
    expect(context.evidence).toHaveLength(2);
  });
});

function candidate(id: string, body: string, retrievalScore: number): RagEvidenceCandidate {
  return {
    id,
    platform: "steam",
    sourceUrl: `https://example.test/${id}`,
    body,
    contentHash: id,
    collectedAt: "2026-07-10T00:00:00.000Z",
    retrievalScore
  };
}
