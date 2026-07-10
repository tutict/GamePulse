import { describe, expect, it } from "vitest";
import { buildCommentSearchQuery } from "./commentSearch.js";

describe("comment search query", () => {
  it("uses stable keyset pagination without offset", () => {
    const query = buildCommentSearchQuery({ projectId: "p1", cursorAt: "2026-01-01T00:00:00.000Z", cursorId: "c9", limit: 50, offset: 0 });
    expect(query.text).toContain("r.effective_at <");
    expect(query.text).toContain("r.id <");
    expect(query.text).not.toContain("OFFSET");
    expect(query.values.at(-1)).toBe(51);
  });

  it("uses full text search for latin queries", () => {
    const query = buildCommentSearchQuery({ projectId: "p1", q: "frame drops", limit: 20, offset: 0 });
    expect(query.text).toContain("websearch_to_tsquery");
  });

  it("uses trigram-compatible substring search for Chinese queries", () => {
    const query = buildCommentSearchQuery({ projectId: "p1", q: "闪退", limit: 20, offset: 0 });
    expect(query.text).toContain("LIKE '%' || lower");
  });

  it("keeps offset only for the deprecated compatibility path", () => {
    const query = buildCommentSearchQuery({ projectId: "p1", limit: 20, offset: 100 });
    expect(query.text).toContain("OFFSET");
  });
});