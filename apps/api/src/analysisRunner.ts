import { randomUUID } from "node:crypto";
import type { AnalysisLabel, AnalysisRunInput, EntityAlias, EvidenceRef, ReportSummary, Sentiment, Topic, VersionPeriodMetrics } from "@gamepulse/shared";
import { calculateRiskIndex, classifyCommentHeuristic, excerpt, PLATFORM_LABELS, topicLabel } from "@gamepulse/shared";
import { query, withClient } from "./db.js";
import { createModelGateway } from "./ai.js";
import { getProject, toIso } from "./repository.js";

interface RunRow {
  id: string;
  project_id: string;
  input: AnalysisRunInput;
}

interface CommentRow {
  id: string;
  platform: keyof typeof PLATFORM_LABELS;
  source_url?: string | null;
  body: string;
  posted_at?: Date | null;
  upvotes?: number | null;
}

interface AggregateRow {
  topic: Topic;
  sentiment: Sentiment;
  item_count: string;
  average_severity: string;
  bug_count: string;
  churn_count: string;
}

interface ResolvedWindow {
  label: string;
  periodStart?: string;
  periodEnd?: string;
  releaseAt?: string;
  beforeStart?: string;
  beforeEnd?: string;
  afterStart?: string;
  afterEnd?: string;
}

export async function runAnalysis(runId: string): Promise<string> {
  const runResult = await query<RunRow>("SELECT id, project_id, input FROM analysis_runs WHERE id = $1", [runId]);
  const run = runResult.rows[0];

  if (!run) {
    throw new Error(`Analysis run not found: ${runId}`);
  }

  const project = await getProject(run.project_id);

  if (!project) {
    throw new Error(`Project not found: ${run.project_id}`);
  }

  const window = resolveWindow(run.input, project.versionWindows);
  await markRunProcessing(runId);

  const total = await countComments(project.id, window.periodStart, window.periodEnd);
  await updateProgress(runId, 0, total, "classifying");

  const aliases = project.entityAliases;
  let processed = 0;
  let lastId = "";

  while (true) {
    const rows = await loadCommentBatch(project.id, window.periodStart, window.periodEnd, lastId, 2500);

    if (rows.length === 0) {
      break;
    }

    const labels = rows.map((row) => {
      const label = classifyCommentHeuristic({ body: row.body }, aliases);
      return {
        ...label,
        commentId: row.id
      };
    });

    await upsertLabels(labels);
    processed += rows.length;
    lastId = rows[rows.length - 1]?.id ?? lastId;
    await updateProgress(runId, processed, total, "classifying");
  }

  await updateProgress(runId, processed, total, "aggregating");
  const summary = await buildSummary(project.id, runId, window.periodStart, window.periodEnd, aliases, window);
  const markdown = await buildReportMarkdown(project.name, window.label, window.periodStart, window.periodEnd, summary);
  const reportId = randomUUID();
  const title = `${project.name} ${window.label} 舆情报告`;

  await query(
    `INSERT INTO reports (id, run_id, project_id, title, period_start, period_end, markdown, summary)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [reportId, runId, project.id, title, window.periodStart ?? null, window.periodEnd ?? null, markdown, JSON.stringify(summary)]
  );

  await query(
    `UPDATE analysis_runs
     SET status = 'completed', report_id = $2, progress = $3, completed_at = now()
     WHERE id = $1`,
    [runId, reportId, JSON.stringify({ processed, total, stage: "completed" })]
  );

  return reportId;
}

function resolveWindow(input: AnalysisRunInput, windows: Array<{ id: string; name: string; releasedAt: string; beforeDays: number; afterDays: number }>): ResolvedWindow {
  const matched = input.versionWindowId ? windows.find((window) => window.id === input.versionWindowId) : undefined;

  if (matched) {
    const releasedAt = new Date(matched.releasedAt);
    const periodStart = new Date(releasedAt);
    periodStart.setUTCDate(periodStart.getUTCDate() - matched.beforeDays);
    const periodEnd = new Date(releasedAt);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + matched.afterDays);

    return {
      label: matched.name,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      releaseAt: releasedAt.toISOString(),
      beforeStart: periodStart.toISOString(),
      beforeEnd: releasedAt.toISOString(),
      afterStart: releasedAt.toISOString(),
      afterEnd: periodEnd.toISOString()
    };
  }

  return {
    label: "自定义周期",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd
  };
}

async function markRunProcessing(runId: string): Promise<void> {
  await query(
    `UPDATE analysis_runs
     SET status = 'processing', started_at = COALESCE(started_at, now()), progress = $2
     WHERE id = $1`,
    [runId, JSON.stringify({ processed: 0, total: 0, stage: "processing" })]
  );
}

async function updateProgress(runId: string, processed: number, total: number, stage: string): Promise<void> {
  await query("UPDATE analysis_runs SET progress = $2 WHERE id = $1", [runId, JSON.stringify({ processed, total, stage })]);
}

async function countComments(projectId: string, periodStart?: string, periodEnd?: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT count(*)::text
     FROM raw_items
     WHERE project_id = $1
       AND (($2::timestamptz IS NULL AND $3::timestamptz IS NULL) OR posted_at IS NOT NULL)
       AND ($2::timestamptz IS NULL OR posted_at IS NULL OR posted_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR posted_at IS NULL OR posted_at <= $3::timestamptz)`,
    [projectId, periodStart ?? null, periodEnd ?? null]
  );

  return Number(result.rows[0]?.count ?? 0);
}

async function loadCommentBatch(projectId: string, periodStart: string | undefined, periodEnd: string | undefined, lastId: string, limit: number): Promise<CommentRow[]> {
  const result = await query<CommentRow>(
    `SELECT id, platform, source_url, body, posted_at, upvotes
     FROM raw_items
     WHERE project_id = $1
       AND id > $2
       AND (($3::timestamptz IS NULL AND $4::timestamptz IS NULL) OR posted_at IS NOT NULL)
       AND ($3::timestamptz IS NULL OR posted_at IS NULL OR posted_at >= $3::timestamptz)
       AND ($4::timestamptz IS NULL OR posted_at IS NULL OR posted_at <= $4::timestamptz)
     ORDER BY id ASC
     LIMIT $5`,
    [projectId, lastId, periodStart ?? null, periodEnd ?? null, limit]
  );

  return result.rows;
}

async function upsertLabels(labels: AnalysisLabel[]): Promise<void> {
  if (labels.length === 0) {
    return;
  }

  await withClient(async (client) => {
    for (let index = 0; index < labels.length; index += 1000) {
      const chunk = labels.slice(index, index + 1000);
      const values: unknown[] = [];
      const placeholders = chunk.map((label, chunkIndex) => {
        const offset = chunkIndex * 11;
        values.push(
          label.commentId,
          label.sentiment,
          label.topic,
          label.intent,
          label.severity,
          label.isBug,
          label.isChurnRisk,
          JSON.stringify(label.entities),
          label.confidence,
          label.rationale,
          label.model
        );

        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11})`;
      });

      await client.query(
        `INSERT INTO analysis_labels (
          comment_id, sentiment, topic, intent, severity, is_bug, is_churn_risk, entities, confidence, rationale, model
        ) VALUES ${placeholders.join(",")}
        ON CONFLICT (comment_id) DO UPDATE SET
          sentiment = EXCLUDED.sentiment,
          topic = EXCLUDED.topic,
          intent = EXCLUDED.intent,
          severity = EXCLUDED.severity,
          is_bug = EXCLUDED.is_bug,
          is_churn_risk = EXCLUDED.is_churn_risk,
          entities = EXCLUDED.entities,
          confidence = EXCLUDED.confidence,
          rationale = EXCLUDED.rationale,
          model = EXCLUDED.model`,
        values
      );
    }
  });
}

async function buildSummary(
  projectId: string,
  runId: string,
  periodStart: string | undefined,
  periodEnd: string | undefined,
  aliases: EntityAlias[],
  versionWindow?: ResolvedWindow
): Promise<ReportSummary> {
  const metrics = await loadPeriodMetrics(projectId, periodStart, periodEnd, true, !periodStart && !periodEnd);
  const topicClusters = await createTopicClusters(projectId, runId, periodStart, periodEnd, "complaint");
  const bugClusters = await createTopicClusters(projectId, runId, periodStart, periodEnd, "bug");
  const entityHeat = aliases.length > 0 ? await loadEntityHeat(projectId, periodStart, periodEnd) : [];
  const versionComparison = versionWindow?.releaseAt ? await buildVersionComparison(projectId, versionWindow) : undefined;

  return {
    totalComments: metrics.totalComments,
    negativeRate: metrics.negativeRate,
    bugRate: metrics.bugRate,
    churnRiskRate: metrics.churnRiskRate,
    riskIndex: metrics.riskIndex,
    topComplaints: topicClusters,
    topBugs: bugClusters,
    entityHeat,
    versionComparison
  };
}

async function loadPeriodMetrics(
  projectId: string,
  periodStart: string | undefined,
  periodEnd: string | undefined,
  inclusiveEnd = false,
  includeUndated = false
): Promise<VersionPeriodMetrics> {
  const endOperator = inclusiveEnd ? "<=" : "<";
  const result = await query<{
    total: string;
    negative: string;
    bug: string;
    churn: string;
    average_severity: string;
  }>(
    `SELECT
       count(*)::text AS total,
       count(*) FILTER (WHERE l.sentiment IN ('negative','mixed'))::text AS negative,
       count(*) FILTER (WHERE l.is_bug)::text AS bug,
       count(*) FILTER (WHERE l.is_churn_risk)::text AS churn,
       COALESCE(avg(l.severity), 0)::text AS average_severity
     FROM raw_items r
     JOIN analysis_labels l ON l.comment_id = r.id
     WHERE r.project_id = $1
       AND (::boolean OR r.posted_at IS NOT NULL)
       AND ($2::timestamptz IS NULL OR r.posted_at IS NULL OR r.posted_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR r.posted_at IS NULL OR r.posted_at ${endOperator} $3::timestamptz)`,
    [projectId, periodStart ?? null, periodEnd ?? null, includeUndated]
  );

  return metricsFromStats(result.rows[0]);
}

function metricsFromStats(row: { total?: string; negative?: string; bug?: string; churn?: string; average_severity?: string } | undefined): VersionPeriodMetrics {
  const total = Number(row?.total ?? 0);
  const negative = Number(row?.negative ?? 0);
  const bug = Number(row?.bug ?? 0);
  const churn = Number(row?.churn ?? 0);
  const averageSeverity = Number(row?.average_severity ?? 0);

  return {
    totalComments: total,
    negativeRate: total > 0 ? negative / total : 0,
    bugRate: total > 0 ? bug / total : 0,
    churnRiskRate: total > 0 ? churn / total : 0,
    riskIndex: calculateRiskIndex({ total, negative, bug, churnRisk: churn, averageSeverity })
  };
}

async function buildVersionComparison(projectId: string, window: ResolvedWindow): Promise<ReportSummary["versionComparison"]> {
  if (!window.releaseAt) {
    return undefined;
  }

  const before = await loadPeriodMetrics(projectId, window.beforeStart, window.beforeEnd);
  const after = await loadPeriodMetrics(projectId, window.afterStart, window.afterEnd, true);

  return {
    releaseAt: window.releaseAt,
    before,
    after,
    delta: {
      totalComments: after.totalComments - before.totalComments,
      negativeRate: after.negativeRate - before.negativeRate,
      bugRate: after.bugRate - before.bugRate,
      churnRiskRate: after.churnRiskRate - before.churnRiskRate,
      riskIndex: after.riskIndex - before.riskIndex
    }
  };
}

async function createTopicClusters(
  projectId: string,
  runId: string,
  periodStart: string | undefined,
  periodEnd: string | undefined,
  kind: "complaint" | "bug"
): Promise<ReportSummary["topComplaints"]> {
  const condition = kind === "bug" ? "l.is_bug = true" : "l.sentiment IN ('negative','mixed')";
  const aggregate = await query<AggregateRow>(
    `SELECT
       l.topic,
       CASE WHEN count(*) FILTER (WHERE l.sentiment = 'negative') >= count(*) / 2 THEN 'negative' ELSE 'mixed' END AS sentiment,
       count(*)::text AS item_count,
       COALESCE(avg(l.severity), 0)::text AS average_severity,
       count(*) FILTER (WHERE l.is_bug)::text AS bug_count,
       count(*) FILTER (WHERE l.is_churn_risk)::text AS churn_count
     FROM raw_items r
     JOIN analysis_labels l ON l.comment_id = r.id
     WHERE r.project_id = $1
       AND ${condition}
       AND ($2::timestamptz IS NULL OR r.posted_at IS NULL OR r.posted_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR r.posted_at IS NULL OR r.posted_at <= $3::timestamptz)
     GROUP BY l.topic
     ORDER BY count(*) DESC, avg(l.severity) DESC
     LIMIT 8`,
    [projectId, periodStart ?? null, periodEnd ?? null]
  );

  const clusters: ReportSummary["topComplaints"] = [];

  for (const row of aggregate.rows) {
    const evidence = await loadEvidence(projectId, row.topic, kind, periodStart, periodEnd);
    const label = topicLabel(row.topic);
    const itemCount = Number(row.item_count);
    const severity = Number(row.average_severity);
    const summary = `${label}相关反馈共 ${itemCount} 条，平均严重度 ${severity.toFixed(1)}。`;
    const recommendation = recommendationFor(row.topic, kind, Number(row.churn_count));
    const cluster = {
      id: randomUUID(),
      projectId,
      runId,
      kind,
      label,
      itemCount,
      sentiment: row.sentiment,
      severity,
      summary,
      recommendation,
      evidence,
      createdAt: new Date().toISOString()
    };

    clusters.push(cluster);
    await query(
      `INSERT INTO topic_clusters (
        id, project_id, run_id, kind, label, item_count, sentiment, severity, summary, recommendation, evidence
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        cluster.id,
        cluster.projectId,
        cluster.runId,
        cluster.kind,
        cluster.label,
        cluster.itemCount,
        cluster.sentiment,
        cluster.severity,
        cluster.summary,
        cluster.recommendation,
        JSON.stringify(cluster.evidence)
      ]
    );
  }

  return clusters;
}

async function loadEvidence(projectId: string, topic: Topic, kind: "complaint" | "bug", periodStart: string | undefined, periodEnd: string | undefined): Promise<EvidenceRef[]> {
  const condition = kind === "bug" ? "l.is_bug = true" : "l.sentiment IN ('negative','mixed')";
  const result = await query<CommentRow & { sentiment: Sentiment; severity: number }>(
    `SELECT r.id, r.platform, r.source_url, r.body, r.posted_at, r.upvotes, l.sentiment, l.severity
     FROM raw_items r
     JOIN analysis_labels l ON l.comment_id = r.id
     WHERE r.project_id = $1
       AND l.topic = $2
       AND ${condition}
       AND ($3::timestamptz IS NULL OR r.posted_at IS NULL OR r.posted_at >= $3::timestamptz)
       AND ($4::timestamptz IS NULL OR r.posted_at IS NULL OR r.posted_at <= $4::timestamptz)
     ORDER BY l.severity DESC, r.upvotes DESC NULLS LAST, r.posted_at DESC NULLS LAST
     LIMIT 5`,
    [projectId, topic, periodStart ?? null, periodEnd ?? null]
  );

  return result.rows.map((row) => ({
    commentId: row.id,
    platform: row.platform,
    sourceUrl: row.source_url ?? undefined,
    postedAt: row.posted_at ? toIso(row.posted_at) : undefined,
    excerpt: excerpt(row.body),
    sentiment: row.sentiment,
    severity: row.severity
  }));
}

async function loadEntityHeat(projectId: string, periodStart: string | undefined, periodEnd: string | undefined): Promise<ReportSummary["entityHeat"]> {
  const result = await query<{
    kind: string;
    canonical: string;
    count: string;
    negative: string;
  }>(
    `SELECT
       entity->>'kind' AS kind,
       entity->>'canonical' AS canonical,
       count(*)::text AS count,
       count(*) FILTER (WHERE l.sentiment IN ('negative','mixed'))::text AS negative
     FROM raw_items r
     JOIN analysis_labels l ON l.comment_id = r.id
     CROSS JOIN LATERAL jsonb_array_elements(l.entities) AS entity
     WHERE r.project_id = $1
       AND ($2::timestamptz IS NULL OR r.posted_at IS NULL OR r.posted_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR r.posted_at IS NULL OR r.posted_at <= $3::timestamptz)
     GROUP BY entity->>'kind', entity->>'canonical'
     ORDER BY count(*) DESC
     LIMIT 20`,
    [projectId, periodStart ?? null, periodEnd ?? null]
  );

  return result.rows.map((row) => {
    const count = Number(row.count);
    const negative = Number(row.negative);
    return {
      kind: row.kind as ReportSummary["entityHeat"][number]["kind"],
      canonical: row.canonical,
      count,
      negativeRate: count > 0 ? negative / count : 0
    };
  });
}

async function buildReportMarkdown(
  projectName: string,
  windowLabel: string,
  periodStart: string | undefined,
  periodEnd: string | undefined,
  summary: ReportSummary
): Promise<string> {
  const gateway = createModelGateway();
  const modelSummary = await gateway.complete([
    {
      role: "system",
      content: "你是游戏社区舆情分析助手。请用中文给运营和制作团队写简短、证据导向的版本舆情摘要。"
    },
    {
      role: "user",
      content: JSON.stringify({
        projectName,
        windowLabel,
        totalComments: summary.totalComments,
        riskIndex: summary.riskIndex,
        negativeRate: summary.negativeRate,
        bugRate: summary.bugRate,
        churnRiskRate: summary.churnRiskRate,
        versionComparison: summary.versionComparison,
        topComplaints: summary.topComplaints.map((cluster) => ({ label: cluster.label, count: cluster.itemCount, severity: cluster.severity })),
        topBugs: summary.topBugs.map((cluster) => ({ label: cluster.label, count: cluster.itemCount, severity: cluster.severity }))
      })
    }
  ]);

  const periodLine = periodStart || periodEnd ? `周期：${periodStart ?? "未限定"} 至 ${periodEnd ?? "未限定"}` : "周期：全部已导入评论";
  const lines = [
    `# ${projectName} ${windowLabel} 舆情报告`,
    "",
    periodLine,
    "",
    "## 总览",
    "",
    `- 评论总量：${summary.totalComments}`,
    `- 负面/混合占比：${percent(summary.negativeRate)}`,
    `- BUG信号占比：${percent(summary.bugRate)}`,
    `- 流失风险信号占比：${percent(summary.churnRiskRate)}`,
    `- 舆情风险指数：${summary.riskIndex}/100`,
    "",
    modelSummary ? `> ${modelSummary.replace(/\n+/g, " ")}` : "> 当前报告基于本地启发式分类和聚类生成；建议优先查看高严重度簇的原文证据。",
    "",
    "## 版本前后变化",
    "",
    renderVersionComparison(summary.versionComparison),
    "",
    "## 高频抱怨",
    "",
    renderClusters(summary.topComplaints),
    "",
    "## BUG聚类",
    "",
    renderClusters(summary.topBugs),
    "",
    "## 角色/系统热度",
    "",
    renderEntityHeat(summary.entityHeat),
    "",
    "## 建议动作",
    "",
    "- 先处理平均严重度最高且带有流失信号的簇。",
    "- 对 BUG 簇保留原文链接，回到对应平台确认复现环境。",
    "- 对角色和系统热度只看趋势，不把单条高赞评论当作整体结论。"
  ];

  return lines.join("\n");
}

function renderVersionComparison(comparison: ReportSummary["versionComparison"]): string {
  if (!comparison) {
    return "未选择版本窗口，暂无发布前后对比。";
  }

  return [
    `- 发布时间：${comparison.releaseAt}`,
    `- 评论量变化：${signedNumber(comparison.delta.totalComments)} 条（发布前 ${comparison.before.totalComments} / 发布后 ${comparison.after.totalComments}）`,
    `- 负面/混合占比变化：${signedPercent(comparison.delta.negativeRate)}（发布前 ${percent(comparison.before.negativeRate)} / 发布后 ${percent(comparison.after.negativeRate)}）`,
    `- BUG 信号占比变化：${signedPercent(comparison.delta.bugRate)}（发布前 ${percent(comparison.before.bugRate)} / 发布后 ${percent(comparison.after.bugRate)}）`,
    `- 流失风险占比变化：${signedPercent(comparison.delta.churnRiskRate)}（发布前 ${percent(comparison.before.churnRiskRate)} / 发布后 ${percent(comparison.after.churnRiskRate)}）`,
    `- 舆情风险指数变化：${signedNumber(comparison.delta.riskIndex)}（发布前 ${comparison.before.riskIndex} / 发布后 ${comparison.after.riskIndex}）`
  ].join("\n");
}

function renderClusters(clusters: ReportSummary["topComplaints"]): string {
  if (clusters.length === 0) {
    return "暂无足够数据。";
  }

  return clusters
    .map((cluster, index) => {
      const evidence = cluster.evidence
        .map((item) => `  - [${PLATFORM_LABELS[item.platform]}] ${item.excerpt}${item.sourceUrl ? ` (${item.sourceUrl})` : ""}`)
        .join("\n");
      return `${index + 1}. ${cluster.label}：${cluster.summary}\n   建议：${cluster.recommendation}\n${evidence}`;
    })
    .join("\n\n");
}

function renderEntityHeat(entityHeat: ReportSummary["entityHeat"]): string {
  if (entityHeat.length === 0) {
    return "暂无命中项目词表的角色或系统实体。";
  }

  return entityHeat
    .slice(0, 10)
    .map((entity, index) => `${index + 1}. ${entity.canonical}（${entity.kind}）：${entity.count} 条，负面/混合占比 ${percent(entity.negativeRate)}`)
    .join("\n");
}

function recommendationFor(topic: Topic, kind: "complaint" | "bug", churnCount: number): string {
  if (kind === "bug") {
    return "转入缺陷排查，按证据样例补充平台、设备、版本和复现路径。";
  }

  if (churnCount > 0) {
    return "优先确认该问题是否正在推动退坑/退款，必要时发布短公告说明处理计划。";
  }

  const defaults: Partial<Record<Topic, string>> = {
    monetization: "复核付费点、抽取体验和活动奖励预期，避免负面情绪继续扩散。",
    balance: "拉取战斗/对局数据交叉验证，避免只按社区声量调整数值。",
    performance: "优先定位机型、场景和版本差异，给出可验证的优化路线。",
    content: "评估玩家消耗速度和下个活动节奏，准备短期补偿或沟通。"
  };

  return defaults[topic] ?? "安排负责人复核原文证据，判断是否需要版本修复、公告或客服话术。";
}

function signedNumber(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function signedPercent(value: number): string {
  const rounded = Math.round(value * 1000) / 10;
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}

function percent(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

export async function failRun(runId: string, error: unknown): Promise<void> {
  await query(
    `UPDATE analysis_runs
     SET status = 'failed', error = $2, completed_at = now()
     WHERE id = $1`,
    [runId, error instanceof Error ? error.message : String(error)]
  );
}
