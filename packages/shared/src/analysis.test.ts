import { describe, expect, it } from "vitest";
import { buildContentHash, hashAuthor } from "./privacy.js";
import { calculateRiskIndex, classifyCommentHeuristic, extractEntities } from "./analysis.js";

describe("shared analysis helpers", () => {
  it("classifies bug and churn signals", () => {
    const label = classifyCommentHeuristic({
      body: "新版本更新后一直闪退，抽卡还这么坑，真的要退坑了"
    });

    expect(label.sentiment).toBe("negative");
    expect(label.isBug).toBe(true);
    expect(label.isChurnRisk).toBe(true);
    expect(label.severity).toBeGreaterThanOrEqual(4);
  });

  it("extracts configured entities", () => {
    const entities = extractEntities("镜流这版强度又被削了", [
      { kind: "character", canonical: "镜流", aliases: ["jl"] }
    ]);

    expect(entities).toEqual([{ kind: "character", canonical: "镜流", matchedAliases: ["镜流"] }]);
  });

  it("hashes authors and content deterministically", () => {
    const author = hashAuthor({ platform: "steam", authorName: "Player One" });
    const content = buildContentHash({ platform: "steam", body: "same body" });

    expect(author).toBe(hashAuthor({ platform: "steam", authorName: "Player One" }));
    expect(content).toBe(buildContentHash({ platform: "steam", body: "same body" }));
  });

  it("computes bounded public-opinion risk", () => {
    expect(calculateRiskIndex({ total: 100, negative: 40, bug: 12, churnRisk: 8, averageSeverity: 3.5 })).toBeGreaterThan(25);
    expect(calculateRiskIndex({ total: 0, negative: 0, bug: 0, churnRisk: 0, averageSeverity: 0 })).toBe(0);
  });
});

