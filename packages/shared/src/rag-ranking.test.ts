import { describe, expect, it } from "vitest";
import { rerankEvidence, type RagEvidenceCandidate } from "./rag.js";

describe("RAG evidence reranking", () => {
  it("deduplicates, sorts, limits to eight, and caps each source at two", () => {
    const candidates: RagEvidenceCandidate[] = [
      candidate("a1", "thread-a", "login crash after update", 4, "hash-a1"),
      candidate("a2", "thread-a", "login fails every time", 3, "hash-a2"),
      candidate("a3", "thread-a", "crash on startup", 10, "hash-a3"),
      candidate("a4", "thread-a", "login issue", 1, "hash-a4"),
      candidate("b1", "thread-b", "login crash", 9, "duplicate"),
      candidate("b2", "thread-b", "login crash", 8, "duplicate"),
      candidate("c1", "thread-c", "login timeout", 7, "hash-c1"),
      candidate("d1", "thread-d", "crash when loading", 6, "hash-d1"),
      candidate("e1", "thread-e", "login unavailable", 5, "hash-e1"),
      candidate("f1", "thread-f", "crash report", 4, "hash-f1"),
      candidate("g1", "thread-g", "login broken", 3, "hash-g1"),
      candidate("h1", "thread-h", "crash again", 2, "hash-h1")
    ];

    const ranked = rerankEvidence("login crash", candidates);

    expect(ranked).toHaveLength(8);
    expect(ranked[0]?.id).toBe("a3");
    expect(ranked.filter((item) => item.sourceUrl === "thread-a")).toHaveLength(2);
    expect(ranked.filter((item) => item.contentHash === "duplicate")).toHaveLength(1);
  });
});

function candidate(
  id: string,
  sourceUrl: string,
  body: string,
  retrievalScore: number,
  contentHash: string
): RagEvidenceCandidate {
  return {
    id,
    platform: "steam",
    sourceUrl,
    body,
    contentHash,
    collectedAt: `2026-07-${id.length.toString().padStart(2, "0")}T00:00:00.000Z`,
    retrievalScore
  };
}
