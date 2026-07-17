import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { encodeResearchDocx } from "./reportDocx.js";
import {
  buildResearchDocument,
  renderResearchDocumentHtml,
  researchDocumentFileName
} from "./reportDocument.js";
import type { ResearchRecord } from "./types.js";

const research: ResearchRecord = {
  id: "research-1",
  request: {
    gameName: "测试：游戏",
    focus: "联机稳定性",
    periodDays: 90
  },
  status: "completed",
  sources: [{
    id: "source-1",
    platform: "steam",
    title: "Steam 评测",
    url: "https://example.test/reviews",
    status: "covered",
    itemCount: 1
  }],
  evidence: [{
    id: "evidence-1",
    sourceId: "source-1",
    platform: "steam",
    sourceTitle: "Steam <评测>",
    sourceUrl: "https://example.test/reviews?a=1&b=2",
    body: "联机体验仍会偶发断线，但合作玩法很有吸引力。",
    excerpt: "联机体验仍会偶发断线。",
    postedAt: "2026-07-16T08:00:00.000Z",
    sentiment: "negative",
    relevance: 0.95
  }],
  exclusions: [],
  reports: [{
    id: "report-1",
    version: 2,
    verdict: "整体评价分化。",
    summary: "优点与稳定性风险同时存在。",
    positiveRate: 45,
    neutralRate: 25,
    negativeRate: 30,
    topics: [{
      id: "stability",
      label: "联机稳定性",
      sentiment: "mixed",
      summary: "断线问题被反复提及。",
      evidenceIds: ["evidence-1"]
    }],
    strengths: ["合作玩法有吸引力。"],
    risks: ["联机断线影响长局体验。"],
    controversies: ["不同设备体验差异较大。"],
    coverage: {
      coveredSources: 1,
      failedSources: 0,
      excludedSources: 0,
      evidenceCount: 1
    },
    createdAt: "2026-07-16T09:00:00.000Z"
  }],
  createdAt: "2026-07-16T07:00:00.000Z",
  updatedAt: "2026-07-16T09:00:00.000Z"
};

describe("research report documents", () => {
  it("builds stable citations and safe file names", () => {
    const document = buildResearchDocument(research);

    expect(document.topics[0]?.citations).toEqual(["E1"]);
    expect(document.evidence[0]?.label).toBe("E1");
    expect(researchDocumentFileName(document, "docx")).toBe(
      "测试：游戏-风评研究报告-v2.docx"
    );
  });

  it("keeps exported file names within a portable 255-byte limit", () => {
    const document = buildResearchDocument(research);
    document.gameName = `🎮${"超长游戏名称".repeat(80)}`;
    const fileName = researchDocumentFileName(document, "docx");

    expect(new TextEncoder().encode(fileName).byteLength).toBeLessThanOrEqual(255);
    expect(fileName).toMatch(/-风评研究报告-v2\.docx$/);
  });

  it("creates a real docx package with escaped content and hyperlinks", () => {
    const bytes = encodeResearchDocx(buildResearchDocument(research));
    const files = unzipSync(bytes);
    const documentXml = strFromU8(files["word/document.xml"]!);
    const relationships = strFromU8(files["word/_rels/document.xml.rels"]!);

    expect(documentXml).toContain("GamePulse 游戏舆论风评研究报告");
    expect(documentXml).toContain("Steam &lt;评测&gt;");
    expect(documentXml).toContain("[E1]");
    expect(relationships).toContain("a=1&amp;b=2");
    expect(files["word/styles.xml"]).toBeDefined();
    expect(files["word/numbering.xml"]).toBeDefined();
  });

  it("renders printable HTML without injecting source markup", () => {
    const html = renderResearchDocumentHtml(buildResearchDocument(research));

    expect(html).toContain("@page{size:A4");
    expect(html).toContain("Steam &lt;评测&gt;");
    expect(html).toContain("https://example.test/reviews?a=1&amp;b=2");
    expect(html).not.toContain("Steam <评测>");
  });

  it("does not emit active links for unsupported source schemes", () => {
    const unsafe = structuredClone(research);
    unsafe.evidence[0]!.sourceUrl = "javascript:alert(1)";
    const document = buildResearchDocument(unsafe);

    expect(document.evidence[0]?.sourceUrl).toBe("");
    expect(renderResearchDocumentHtml(document)).not.toContain("javascript:");
  });
});
