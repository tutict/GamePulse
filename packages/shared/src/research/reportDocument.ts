import {
  compareResearchEvidence,
  type ResearchRecord,
  type ResearchSentiment
} from "./types.js";

export type ResearchDocumentFormat = "docx" | "pdf";

export interface ResearchDocumentData {
  researchId: string;
  gameName: string;
  focus?: string;
  periodDays: number;
  reportVersion: number;
  createdAt: string;
  verdict: string;
  summary: string;
  positiveRate: number;
  neutralRate: number;
  negativeRate: number;
  historicalDelta?: number;
  topics: Array<{
    label: string;
    sentiment: ResearchSentiment;
    summary: string;
    citations: string[];
  }>;
  strengths: string[];
  risks: string[];
  controversies: string[];
  coverage: {
    coveredSources: number;
    failedSources: number;
    excludedSources: number;
    evidenceCount: number;
  };
  evidence: Array<{
    label: string;
    platform: string;
    sourceTitle: string;
    sourceUrl: string;
    excerpt: string;
    body: string;
    postedAt: string;
    dateEstimated: boolean;
    sentiment: Exclude<ResearchSentiment, "mixed">;
    relevance: number;
    excluded: boolean;
    exclusionReason?: string;
  }>;
}

export function buildResearchDocument(research: ResearchRecord): ResearchDocumentData {
  const report = research.reports.at(-1);
  if (!report) {
    throw new Error("Research report is not available");
  }
  const exclusions = new Map(
    research.exclusions.map((item) => [item.evidenceId, item.reason])
  );
  const sortedEvidence = research.evidence.slice().sort(compareResearchEvidence);
  const citationById = new Map(
    sortedEvidence.map((item, index) => [item.id, `E${index + 1}`])
  );
  return {
    researchId: research.id,
    gameName: research.request.gameName,
    focus: research.request.focus,
    periodDays: research.request.periodDays,
    reportVersion: report.version,
    createdAt: report.createdAt,
    verdict: report.verdict,
    summary: report.summary,
    positiveRate: report.positiveRate,
    neutralRate: report.neutralRate,
    negativeRate: report.negativeRate,
    historicalDelta: report.historicalDelta,
    topics: report.topics.map((topic) => ({
      label: topic.label,
      sentiment: topic.sentiment,
      summary: topic.summary,
      citations: topic.evidenceIds
        .map((id) => citationById.get(id))
        .filter((label): label is string => Boolean(label))
    })),
    strengths: report.strengths,
    risks: report.risks,
    controversies: report.controversies,
    coverage: report.coverage,
    evidence: sortedEvidence.map((item, index) => ({
      label: `E${index + 1}`,
      platform: item.platform,
      sourceTitle: item.sourceTitle,
      sourceUrl: safeDocumentUrl(item.sourceUrl),
      excerpt: item.excerpt,
      body: item.body,
      postedAt: item.postedAt,
      dateEstimated: Boolean(item.dateEstimated),
      sentiment: item.sentiment,
      relevance: item.relevance,
      excluded: exclusions.has(item.id),
      exclusionReason: exclusions.get(item.id)
    }))
  };
}

export function researchDocumentFileName(
  document: ResearchDocumentData,
  format: ResearchDocumentFormat
): string {
  const suffix = `-风评研究报告-v${document.reportVersion}.${format}`;
  const safeName = document.gameName
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim() || "gamepulse-report";
  const availableBytes = Math.max(1, 255 - utf8Length(suffix));
  return `${truncateUtf8(safeName, availableBytes)}${suffix}`;
}

export function renderResearchDocumentHtml(document: ResearchDocumentData): string {
  const list = (items: string[]) => items.length
    ? `<ul>${items.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`
    : `<p class="muted">当前样本中暂无明确结论。</p>`;
  const topics = document.topics.length
    ? document.topics.map((topic, index) =>
      `<article class="topic"><b>${String(index + 1).padStart(2, "0")}</b><div><h3>${html(topic.label)} <small>${sentimentLabel(topic.sentiment)}</small></h3><p>${html(topic.summary)} <em>${topic.citations.map((item) => `[${html(item)}]`).join(" ")}</em></p></div></article>`
    ).join("")
    : `<p class="muted">当前证据不足以归纳稳定主题。</p>`;
  const evidence = document.evidence.length
    ? document.evidence.map((item) =>
      `<article class="evidence"><h3>[${item.label}] ${html(item.sourceTitle)}${item.excluded ? " <small>已排除</small>" : ""}</h3>` +
      `<p class="meta">${html(item.platform)} · ${formatDocumentDate(item.postedAt)}${item.dateEstimated ? "（日期估算）" : ""} · 相关度 ${Math.round(item.relevance * 100)}% · ${sentimentLabel(item.sentiment)}</p>` +
      (item.sourceUrl ? `<p class="url"><a href="${attribute(item.sourceUrl)}">${html(item.sourceUrl)}</a></p>` : "") +
      `<blockquote>${html(item.excerpt)}</blockquote>` +
      (item.body && item.body !== item.excerpt ? `<p>${html(item.body)}</p>` : "") +
      (item.exclusionReason ? `<p class="warning">排除原因：${html(item.exclusionReason)}</p>` : "") +
      `</article>`
    ).join("")
    : `<p class="muted">当前报告没有可列出的证据。</p>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${html(document.gameName)} - 风评研究报告</title><style>
@page{size:A4;margin:18mm 17mm}*{box-sizing:border-box}body{margin:0;color:#202524;font:10.5pt/1.72 "Microsoft YaHei","Noto Sans CJK SC","PingFang SC",Arial,sans-serif}header{border-bottom:2px solid #245b62;padding-bottom:14px;margin-bottom:22px}h1{font-size:25pt;line-height:1.2;margin:0;color:#173f45}header h2{font-size:16pt;margin:8px 0 0}h2{font-size:16pt;color:#173f45;margin:26px 0 10px;break-after:avoid}h3{font-size:11.5pt;margin:0 0 5px;break-after:avoid}p{margin:0 0 9px}.meta,.muted{color:#66716f;font-size:9pt}.verdict{background:#173f45;color:#fff;padding:16px 18px;border-radius:4px;break-inside:avoid}.verdict strong{display:block;font-size:14pt;margin-bottom:7px}.metrics{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #ccd5d2;break-inside:avoid}.metric{text-align:center;padding:13px}.metric+.metric{border-left:1px solid #ccd5d2}.metric b{display:block;font-size:18pt}.positive b{color:#18764a}.neutral b{color:#5d6664}.negative b{color:#a53b35}.topic{display:grid;grid-template-columns:34px 1fr;gap:8px;padding:11px 0;border-bottom:1px solid #dfe5e2;break-inside:avoid}.topic>b{color:#77817f}.topic small,.evidence small{padding:1px 6px;border:1px solid #b8c4c0;border-radius:3px;color:#586562}.topic em{color:#245b62;font-style:normal;font-weight:700}.findings{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.findings section{break-inside:avoid}ul{margin:5px 0 0;padding-left:18px}li{margin-bottom:6px}.coverage{width:100%;border-collapse:collapse;break-inside:avoid}.coverage td{border:1px solid #ccd5d2;text-align:center;padding:10px}.coverage b{display:block;font-size:15pt}.note{margin-top:12px;padding:10px 12px;background:#f1f4f2;color:#586260;border-left:3px solid #6d8780}.appendix{break-before:page}.evidence{padding:12px 0;border-bottom:1px solid #dfe5e2;break-inside:avoid-page}.url{font-size:8.5pt;word-break:break-all}.url a{color:#245b62}blockquote{margin:8px 0;padding:8px 11px;background:#f5f7f6;border-left:3px solid #8aa09a}.warning{color:#8b312d;font-weight:700}.footer{margin-top:28px;padding-top:10px;border-top:1px solid #ccd5d2;color:#6d7674;font-size:8pt}
</style></head><body><header><h1>GamePulse 游戏舆论风评研究报告</h1><h2>${html(document.gameName)}</h2><p class="meta">报告 v${document.reportVersion} · ${formatDocumentDate(document.createdAt)} · 研究窗口 ${document.periodDays} 天${document.focus ? ` · 重点：${html(document.focus)}` : ""}</p></header>
<section class="verdict"><strong>总体判断</strong><p>${html(document.verdict)}</p><p>${html(document.summary)}</p></section><h2>样本口碑概览</h2><div class="metrics"><div class="metric positive">正面<b>${document.positiveRate}%</b></div><div class="metric neutral">中性<b>${document.neutralRate}%</b></div><div class="metric negative">负面<b>${document.negativeRate}%</b></div></div>
${document.historicalDelta === undefined ? "" : `<p class="meta">相比上一版：${document.historicalDelta > 0 ? "+" : ""}${document.historicalDelta} 个百分点</p>`}<h2>主要关注主题</h2>${topics}
<div class="findings"><section><h2>核心优点</h2>${list(document.strengths)}</section><section><h2>核心问题</h2>${list(document.risks)}</section><section><h2>主要争议</h2>${list(document.controversies)}</section></div>
<h2>研究覆盖</h2><table class="coverage"><tr><td>有效证据<b>${document.coverage.evidenceCount}</b></td><td>已覆盖来源<b>${document.coverage.coveredSources}</b></td><td>失败来源<b>${document.coverage.failedSources}</b></td><td>排除来源<b>${document.coverage.excludedSources}</b></td></tr></table><p class="note">本报告基于本次收集到的非随机公开样本，不代表全部玩家。失败或排除的来源不参与当前结论。</p>
<section class="appendix"><h2>证据附录</h2>${evidence}</section><p class="footer">由 GamePulse 本地研究工作台生成 · 研究编号 ${html(document.researchId)}</p></body></html>`;
}

export function sentimentLabel(sentiment: ResearchSentiment): string {
  return { positive: "偏正面", neutral: "中性", negative: "偏负面", mixed: "有分歧" }[sentiment];
}

export function formatDocumentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false
  }).format(date);
}

function safeDocumentUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8Length(character);
    if (bytes + characterBytes > maxBytes) {
      break;
    }
    result += character;
    bytes += characterBytes;
  }
  return result.replace(/[. ]+$/g, "") || "report";
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function html(value: string): string {
  return xml(value).replaceAll("\n", "<br>");
}

function attribute(value: string): string {
  return xml(value);
}

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
