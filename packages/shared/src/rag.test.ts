import { describe, expect, it } from "vitest";
import { buildSearchTerms } from "./rag.js";

describe("shared RAG helpers", () => {
  it("builds deduplicated Chinese and English search terms", () => {
    expect(buildSearchTerms("  Steam 登录 login 登录 CRASH crash  ")).toEqual([
      "steam",
      "login",
      "crash",
      "登录"
    ]);
  });
});
