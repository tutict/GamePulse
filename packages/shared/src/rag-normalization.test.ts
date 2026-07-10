import { describe, expect, it } from "vitest";
import { buildRagContentHash, normalizeCommentText } from "./rag.js";

describe("RAG comment normalization", () => {
  it("normalizes equivalent comments to the same content hash", () => {
    expect(normalizeCommentText("  登录\t失败\r\nCRASH  ")).toBe("登录 失败 CRASH");
    expect(
      buildRagContentHash({
        platform: "steam",
        sourceUrl: "https://example.test/thread/1",
        body: "登录 失败 CRASH"
      })
    ).toBe(
      buildRagContentHash({
        platform: "STEAM",
        sourceUrl: "https://example.test/thread/1",
        body: "  登录\t失败\r\ncrash "
      })
    );
  });
});
