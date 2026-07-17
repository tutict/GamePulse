import { strToU8, zipSync } from "fflate";
import {
  formatDocumentDate,
  sentimentLabel,
  type ResearchDocumentData
} from "./reportDocument.js";

export function encodeResearchDocx(document: ResearchDocumentData): Uint8Array {
  const links = new Map<string, string>();
  const linkId = (url: string): string => {
    const existing = links.get(url);
    if (existing) return existing;
    const id = `rId${links.size + 3}`;
    links.set(url, id);
    return id;
  };
  const body: string[] = [
    paragraph("GamePulse 游戏舆论风评研究报告", "Title"),
    paragraph(document.gameName, "Subtitle"),
    paragraph(`报告 v${document.reportVersion}  |  ${formatDocumentDate(document.createdAt)}  |  研究窗口 ${document.periodDays} 天`, "Meta")
  ];
  if (document.focus) body.push(paragraph(`研究重点：${document.focus}`, "Meta"));
  body.push(
    paragraph("总体判断", "Heading1"),
    paragraph(document.verdict, "Verdict"),
    paragraph(document.summary),
    paragraph("样本口碑概览", "Heading1"),
    table([[
      { text: `正面\n${document.positiveRate}%`, fill: "E5F4ED" },
      { text: `中性\n${document.neutralRate}%`, fill: "EEF0F2" },
      { text: `负面\n${document.negativeRate}%`, fill: "FBE9E7" }
    ]], [3120, 3120, 3120])
  );
  if (document.historicalDelta !== undefined) {
    body.push(paragraph(`相比上一版：${document.historicalDelta > 0 ? "+" : ""}${document.historicalDelta} 个百分点`, "Meta"));
  }
  body.push(paragraph("主要关注主题", "Heading1"));
  if (!document.topics.length) body.push(paragraph("当前证据不足以归纳稳定主题。", "Meta"));
  document.topics.forEach((topic, index) => body.push(
    paragraph(`${index + 1}. ${topic.label}（${sentimentLabel(topic.sentiment)}）`, "Heading2"),
    paragraph(`${topic.summary}${topic.citations.length ? `  ${topic.citations.map((item) => `[${item}]`).join(" ")}` : ""}`)
  ));
  body.push(
    paragraph("核心优点", "Heading1"), ...list(document.strengths),
    paragraph("核心问题", "Heading1"), ...list(document.risks),
    paragraph("主要争议", "Heading1"), ...list(document.controversies),
    paragraph("研究覆盖", "Heading1"),
    table([[
      { text: `有效证据\n${document.coverage.evidenceCount}`, fill: "F2F5F3" },
      { text: `已覆盖来源\n${document.coverage.coveredSources}`, fill: "F2F5F3" },
      { text: `失败来源\n${document.coverage.failedSources}`, fill: "F2F5F3" },
      { text: `排除来源\n${document.coverage.excludedSources}`, fill: "F2F5F3" }
    ]], [2340, 2340, 2340, 2340]),
    paragraph("本报告基于本次收集到的非随机公开样本，不代表全部玩家。失败或排除的来源不参与当前结论。", "Note"),
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
    paragraph("证据附录", "Heading1")
  );
  if (!document.evidence.length) body.push(paragraph("当前报告没有可列出的证据。", "Meta"));
  document.evidence.forEach((item) => {
    body.push(
      paragraph(`[${item.label}] ${item.sourceTitle}${item.excluded ? "（已排除）" : ""}`, "Heading2"),
      paragraph(`${item.platform}  |  ${formatDocumentDate(item.postedAt)}${item.dateEstimated ? "（日期估算）" : ""}  |  相关度 ${Math.round(item.relevance * 100)}%  |  ${sentimentLabel(item.sentiment)}`, "Meta"),
      ...(item.sourceUrl ? [hyperlink(item.sourceUrl, linkId(item.sourceUrl))] : []),
      paragraph(item.excerpt, "Quote")
    );
    if (item.body && item.body !== item.excerpt) body.push(paragraph(item.body));
    if (item.exclusionReason) body.push(paragraph(`排除原因：${item.exclusionReason}`, "Warning"));
  });
  body.push('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1021" w:right="964" w:bottom="1021" w:left="964"/></w:sectPr>');

  const linkRelationships = [...links].map(([url, id]) =>
    rel(id, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", url, true)
  ).join("");
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": bytes(contentTypes),
    "_rels/.rels": bytes(rootRels),
    "docProps/core.xml": bytes(core(document)),
    "docProps/app.xml": bytes(appProperties),
    "word/document.xml": bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>${body.join("")}</w:body></w:document>`),
    "word/styles.xml": bytes(styles),
    "word/numbering.xml": bytes(numbering),
    "word/_rels/document.xml.rels": bytes(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel("rId1", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles", "styles.xml")}${rel("rId2", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering", "numbering.xml")}${linkRelationships}</Relationships>`)
  };
  return zipSync(files, { level: 6 });
}

function list(items: string[]): string[] {
  return items.length ? items.map((item) => paragraph(item, undefined, true)) : [paragraph("当前样本中暂无明确结论。", "Meta")];
}

function paragraph(text: string, style?: string, bullet = false): string {
  const properties = `${style ? `<w:pStyle w:val="${style}"/>` : ""}${bullet ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>' : ""}`;
  const runs = text.split("\n").map((line, index) =>
    `${index ? "<w:r><w:br/></w:r>" : ""}<w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r>`
  ).join("");
  return `<w:p><w:pPr>${properties}</w:pPr>${runs}</w:p>`;
}

function hyperlink(url: string, id: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="SourceLink"/></w:pPr><w:hyperlink r:id="${id}"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>${xml(url)}</w:t></w:r></w:hyperlink></w:p>`;
}

function table(rows: Array<Array<{ text: string; fill: string }>>, widths: number[]): string {
  const total = widths.reduce((sum, value) => sum + value, 0);
  const borders = ["top", "left", "bottom", "right", "insideH", "insideV"]
    .map((edge) => `<w:${edge} w:val="single" w:sz="4" w:color="CCD5D2"/>`).join("");
  const rowXml = rows.map((row) => `<w:tr>${row.map((cell, index) =>
    `<w:tc><w:tcPr><w:tcW w:w="${widths[index] ?? 2000}" w:type="dxa"/><w:shd w:val="clear" w:fill="${cell.fill}"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${cell.text.split("\n").map((line, lineIndex) => `${lineIndex ? "<w:r><w:br/></w:r>" : ""}<w:r><w:rPr><w:b/></w:rPr><w:t>${xml(line)}</w:t></w:r>`).join("")}</w:p></w:tc>`
  ).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblInd w:w="0" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${widths.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${rowXml}</w:tbl>`;
}

function rel(id: string, type: string, target: string, external = false): string {
  return `<Relationship Id="${id}" Type="${type}" Target="${xml(target)}"${external ? ' TargetMode="External"' : ""}/>`;
}

function core(document: ResearchDocumentData): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(document.gameName)} - 风评研究报告</dc:title><dc:creator>GamePulse</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${xml(document.createdAt)}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${xml(document.createdAt)}</dcterms:modified></cp:coreProperties>`;
}

function bytes(value: string): Uint8Array {
  return strToU8(value);
}

function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
const appProperties = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>GamePulse</Application><AppVersion>1.0</AppVersion></Properties>`;
const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Microsoft YaHei" w:eastAsia="Microsoft YaHei" w:hAnsi="Microsoft YaHei"/><w:sz w:val="21"/><w:color w:val="202524"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:color w:val="173F45"/><w:sz w:val="50"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:pPr><w:keepNext/></w:pPr><w:rPr><w:b/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="66716F"/><w:sz w:val="18"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="320" w:after="120"/><w:keepNext/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="173F45"/><w:sz w:val="32"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="220" w:after="70"/><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Verdict"><w:name w:val="Verdict"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="173F45"/><w:ind w:left="180" w:right="180"/></w:pPr><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="27"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Note"><w:name w:val="Note"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="F1F4F2"/><w:ind w:left="160" w:right="160"/></w:pPr><w:rPr><w:color w:val="586260"/><w:sz w:val="19"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:fill="F5F7F6"/><w:ind w:left="240" w:right="120"/></w:pPr><w:rPr><w:i/><w:color w:val="3C4745"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Warning"><w:name w:val="Warning"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="8B312D"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="SourceLink"><w:name w:val="Source Link"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="17"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="245B62"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`;
const numbering = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="480" w:hanging="240"/></w:pPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num></w:numbering>`;
