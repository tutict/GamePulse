import { describe, expect, it } from "vitest";
import { buildNoEvidenceAnswer } from "./rag.js";

describe("RAG fallback answers", () => {
  it("returns a grounded no-evidence answer without inventing claims", () => {
    expect(buildNoEvidenceAnswer("登录为什么失败？")).toBe(
      "没有找到与“登录为什么失败？”匹配的本地证据。请先导入或采集相关评论后重试。"
    );
  });
});
