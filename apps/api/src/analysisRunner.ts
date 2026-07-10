import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { AnalysisLabel, AnalysisRunInput, EntityAlias, EvidenceRef, ReportSummary, Sentiment, Topic, VersionPeriodMetrics } from "@gamepulse/shared";
import { calculateRiskIndex, classifyCommentHeuristic, excerpt, PLATFORM_LABELS, stableHash, topicLabel } from "@gamepulse/shared";
import { loadConfig } from "./config.js";
import { query, withTransaction } from "./db.js";
import { createModelGateway } from "./ai.js";
import { getProject, toIso } from "./repository.js";

interface RunRow {
  id: string;
  project_id: string;
  input: AnalysisRunInput;
  status: string;
  report_id?: string | null;
}

interface CommentRow {
  id: string;
  platform: keyof typeof PLATFORM_LABELS;
  source_url?: string | null;
  body: string;
  posted_at?: Date | null;
  upvotes?: number | null;
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

interface ClassificationStatsRow {
  total: string;
  pending: string;
}

interface MetricsRow extends Record<string, string> {}

interface ClusterRow {
  kind: "complaint" | "bug";
  topic: Topic;
  sentiment: Sentiment;
  item_count: string;
  average_severity: string;
  churn_count: string;
  evidence: EvidenceRef[];
}

interface LabeledComment {
  row: CommentRow;
  label: AnalysisLabel;
}

export async function runAnalysis(runId: string): Promise<string | undefined> {
  const run = await claimRun(runId);
  if (!run) {
    const existing = await query<RunRow>("SELECT id, status, report_id FROM analysis_runs WHERE id = $1", [runId], "analysis.existing");
    return existing.rows[0]?.report_id ?? undefined;
  }

  const project = await getProject(run.project_id);
  if (!project) throw new Error(`Project not found: ${run.project_id}`);

  const config = loadConfig();
  const window = resolveWindow(run.input, project.versionWindows);
  const signature = buildClassificationSignature(project.entityAliases);
  const stats = await loadClassificationStats(project.id, window.periodStart, window.periodEnd, signature);
  const total = Number(stats.total);
  const pending = Number(stats.pending);
  const reused = total - pending;
  const progress = createProgressReporter(runId, pending, reused, config.progressUpdateMs);
  await progress.report(0, "classifying", true);

  let processed = 0;
  let lastId = "";
  while (true) {
    const rows = await loadCommentBatch(project.id, window.periodStart, window.periodEnd, signature, lastId, config.analysisBatchSize);
    if (rows.length === 0) break;

    const labeled = rows.map((row): LabeledComment => ({
      row,
      label: { ...classifyCommentHeuristic({ body: row.body }, project.entityAliases), commentId: row.id, model: signature }
    }));
    await upsertLabeledComments(project.id, labeled);
    processed += rows.length;
    lastId = rows.at(-1)?.id ?? lastId;
    await progress.report(processed, "classifying");
  }

  await progress.report(processed, "aggregating", true);
  const summary = await buildSummary(project.id, runId, window.periodStart, window.periodEnd, project.entityAliases, window);
  const markdown = await buildReportMarkdown(project.name, window.label, window.periodStart, window.periodEnd, summary);
  return persistRunResult(runId, project.id, project.name, window, summary, markdown, processed, pending, reused);
}

function buildClassificationSignature(aliases: EntityAlias[]): string {
  return `heuristic-v2:${stableHash(JSON.stringify(aliases))}`;
}

async function claimRun(runId: string): Promise<RunRow | undefined> {
  const result = await query<RunRow>(
    `UPDATE analysis_runs
     SET status = 'processing', started_at = COALESCE(started_at, now()), completed_at = NULL,
         error = NULL, progress = $2
     WHERE id = $1 AND status IN ('queued','failed')
     RETURNING id, project_id, input, status, report_id`,
    [runId, JSON.stringify({ processed: 0, total: 0, reused: 0, stage: "processing" })],
    "analysis.claim"
  );
  return result.rows[0];
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
  return { label: "自定义周期", periodStart: input.periodStart, periodEnd: input.periodEnd };
}

async function loadClassificationStats(projectId: string, periodStart: string | undefined, periodEnd: string | undefined, signature: string): Promise<ClassificationStatsRow> {
  const result = await query<ClassificationStatsRow>(
    `SELECT count(*)::text AS total,
            count(*) FILTER (WHERE l.comment_id IS NULL OR l.model <> $4)::text AS pending
     FROM raw_items r
     LEFT JOIN analysis_labels l ON l.comment_id = r.id
     WHERE r.project_id = $1
       AND (($2::timestamptz IS NULL AND $3::timestamptz IS NULL) OR r.posted_at IS NOT NULL)
       AND ($2::timestamptz IS NULL OR r.posted_at >= $2::timestamptz)
       AND ($3::timestamptz IS NULL OR r.posted_at <= $3::timestamptz)`,
    [projectId, periodStart ?? null, periodEnd ?? null, signature],
    "analysis.classification_stats"
  );
  return result.rows[0] ?? { total: "0", pending: "0" };
}

async function loadCommentBatch(projectId: string, periodStart: string | undefined, periodEnd: string | undefined, signature: string, lastId: string, limit: number): Promise<CommentRow[]> {
  const result = await query<CommentRow>(
    `SELECT r.id, r.platform, r.source_url, r.body, r.posted_at, r.upvotes
     FROM raw_items r
     LEFT JOIN analysis_labels l ON l.comment_id = r.id
     WHERE r.project_id = $1 AND r.id > $2
       AND (($3::timestamptz IS NULL AND $4::timestamptz IS NULL) OR r.posted_at IS NOT NULL)
       AND ($3::timestamptz IS NULL OR r.posted_at >= $3::timestamptz)
       AND ($4::timestamptz IS NULL OR r.posted_at <= $4::timestamptz)
       AND (l.comment_id IS NULL OR l.model <> $5)
     ORDER BY r.id ASC LIMIT $6`,
    [projectId, lastId, periodStart ?? null, periodEnd ?? null, signature, limit],
    "analysis.comment_batch"
  );
  return result.rows;
}

async function upsertLabeledComments(projectId: string, labeled: LabeledComment[]): Promise<void> {
  if (labeled.length === 0) return;
  await withTransaction(async (client) => {
    for (let index = 0; index < labeled.length; index += 1000) {
      const chunk = labeled.slice(index, index + 1000);
      const values: unknown[] = [];
      const placeholders = chunk.map(({ label }, chunkIndex) => {
        const offset = chunkIndex * 11;
        values.push(label.commentId, label.sentiment, label.topic, label.intent, label.severity, label.isBug, label.isChurnRisk,
          JSON.stringify(label.entities), label.confidence, label.rationale, label.model);
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11})`;
      });
      await client.query(
        `INSERT INTO analysis_labels (comment_id, sentiment, topic, intent, severity, is_bug, is_churn_risk, entities, confidence, rationale, model)
         VALUES ${placeholders.join(",")}
         ON CONFLICT (comment_id) DO UPDATE SET sentiment=EXCLUDED.sentiment, topic=EXCLUDED.topic, intent=EXCLUDED.intent,
           severity=EXCLUDED.severity, is_bug=EXCLUDED.is_bug, is_churn_risk=EXCLUDED.is_churn_risk,
           entities=EXCLUDED.entities, confidence=EXCLUDED.confidence, rationale=EXCLUDED.rationale, model=EXCLUDED.model`,
        values
      );
      const commentIds = chunk.map(({ row }) => row.id);
      await client.query("DELETE FROM analysis_entity_mentions WHERE comment_id = ANY($1::text[])", [commentIds]);
      await insertEntityMentions(client, projectId, chunk);
    }
  });
}

async function insertEntityMentions(client: PoolClient, projectId: string, chunk: LabeledComment[]): Promise<void> {
  const mentions = chunk.flatMap(({ row, label }) => label.entities.map((entity) => ({ row, label, entity })));
  if (mentions.length === 0) return;
  const values: unknown[] = [];
  const placeholders = mentions.map(({ row, label, entity }, index) => {
    const offset = index * 6;
    values.push(row.id, projectId, row.posted_at ?? null, entity.kind, entity.canonical, label.sentiment);
    return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6})`;
  });
  await client.query(
    `INSERT INTO analysis_entity_mentions (comment_id, project_id, posted_at, kind, canonical, sentiment)
     VALUES ${placeholders.join(",")}
     ON CONFLICT (comment_id, kind, canonical) DO UPDATE SET sentiment=EXCLUDED.sentiment, posted_at=EXCLUDED.posted_at`,
    values
  );
}

function createProgressReporter(runId: string, total: number, reused: number, minimumIntervalMs: number) {
  let lastAt = 0;
  let lastPercent = -1;
  return {
    async report(processed: number, stage: string, force = false): Promise<void> {
      const now = Date.now();
      const percent = total > 0 ? Math.floor((processed / total) * 100) : 100;
      if (!force && now - lastAt < minimumIntervalMs && percent <= lastPercent) return;
      lastAt = now;
      lastPercent = percent;
      await query("UPDATE analysis_runs SET progress = $2 WHERE id = $1", [runId, JSON.stringify({ processed, total, reused, stage })], "analysis.progress");
    }
  };
}

async function buildSummary(projectId: string, runId: string, periodStart: string | undefined, periodEnd: string | undefined, aliases: EntityAlias[], window: ResolvedWindow): Promise<ReportSummary> {
  const [metrics, clusters, entityHeat] = await Promise.all([
    loadSummaryMetrics(projectId, periodStart, periodEnd, window),
    loadClusters(projectId, runId, periodStart, periodEnd),
    aliases.length > 0 ? loadEntityHeat(projectId, periodStart, periodEnd) : Promise.resolve([])
  ]);
  return {
    totalComments: metrics.current.totalComments,
    negativeRate: metrics.current.negativeRate,
    bugRate: metrics.current.bugRate,
    churnRiskRate: metrics.current.churnRiskRate,
    riskIndex: metrics.current.riskIndex,
    topComplaints: clusters.filter((cluster) => cluster.kind === "complaint"),
    topBugs: clusters.filter((cluster) => cluster.kind === "bug"),
    entityHeat,
    versionComparison: metrics.versionComparison
  };
}

async function loadSummaryMetrics(projectId: string, periodStart: string | undefined, periodEnd: string | undefined, window: ResolvedWindow): Promise<{ current: VersionPeriodMetrics; versionComparison?: ReportSummary["versionComparison"] }> {
  const result = await query<MetricsRow>(
    `SELECT
       count(*)::text AS current_total,
       count(*) FILTER (WHERE l.sentiment IN ('negative','mixed'))::text AS current_negative,
       count(*) FILTER (WHERE l.is_bug)::text AS current_bug,
       count(*) FILTER (WHERE l.is_churn_risk)::text AS current_churn,
       COALESCE(avg(l.severity),0)::text AS current_average_severity,
       count(*) FILTER (WHERE $4::timestamptz IS NOT NULL AND r.posted_at >= $4 AND r.posted_at < $5)::text AS before_total,
       count(*) FILTER (WHERE $4::timestamptz IS NOT NULL AND r.posted_at >= $4 AND r.posted_at < $5 AND l.sentiment IN ('negative','mixed'))::text AS before_negative,
       count(*) FILTER (WHERE $4::timestamptz IS NOT NULL AND r.posted_at >= $4 AND r.posted_at < $5 AND l.is_bug)::text AS before_bug,
       count(*) FILTER (WHERE $4::timestamptz IS NOT NULL AND r.posted_at >= $4 AND r.posted_at < $5 AND l.is_churn_risk)::text AS before_churn,
       COALESCE(avg(l.severity) FILTER (WHERE $4::timestamptz IS NOT NULL AND r.posted_at >= $4 AND r.posted_at < $5),0)::text AS before_average_severity,
       count(*) FILTER (WHERE $6::timestamptz IS NOT NULL AND r.posted_at >= $6 AND r.posted_at <= $7)::text AS after_total,
       count(*) FILTER (WHERE $6::timestamptz IS NOT NULL AND r.posted_at >= $6 AND r.posted_at <= $7 AND l.sentiment IN ('negative','mixed'))::text AS after_negative,
       count(*) FILTER (WHERE $6::timestamptz IS NOT NULL AND r.posted_at >= $6 AND r.posted_at <= $7 AND l.is_bug)::text AS after_bug,
       count(*) FILTER (WHERE $6::timestamptz IS NOT NULL AND r.posted_at >= $6 AND r.posted_at <= $7 AND l.is_churn_risk)::text AS after_churn,
       COALESCE(avg(l.severity) FILTER (WHERE $6::timestamptz IS NOT NULL AND r.posted_at >= $6 AND r.posted_at <= $7),0)::text AS after_average_severity
     FROM raw_items r JOIN analysis_labels l ON l.comment_id = r.id
     WHERE r.project_id = $1
       AND (($2::timestamptz IS NULL AND $3::timestamptz IS NULL) OR r.posted_at IS NOT NULL)
       AND ($2::timestamptz IS NULL OR r.posted_at >= $2)
       AND ($3::timestamptz IS NULL OR r.posted_at <= $3)`,
    [projectId, periodStart ?? null, periodEnd ?? null, window.beforeStart ?? null, window.beforeEnd ?? null, window.afterStart ?? null, window.afterEnd ?? null],
    "analysis.summary_metrics"
  );
  const row = result.rows[0] ?? {};
  const current = metricsFromPrefix(row, "current");
  if (!window.releaseAt) return { current };
  const before = metricsFromPrefix(row, "before");
  const after = metricsFromPrefix(row, "after");
  return { current, versionComparison: { releaseAt: window.releaseAt, before, after, delta: {
    totalComments: after.totalComments - before.totalComments,
    negativeRate: after.negativeRate - before.negativeRate,
    bugRate: after.bugRate - before.bugRate,
    churnRiskRate: after.churnRiskRate - before.churnRiskRate,
    riskIndex: after.riskIndex - before.riskIndex
  } } };
}

function metricsFromPrefix(row: MetricsRow, prefix: string): VersionPeriodMetrics {
  const total = Number(row[`${prefix}_total`] ?? 0);
  const negative = Number(row[`${prefix}_negative`] ?? 0);
  const bug = Number(row[`${prefix}_bug`] ?? 0);
  const churn = Number(row[`${prefix}_churn`] ?? 0);
  const averageSeverity = Number(row[`${prefix}_average_severity`] ?? 0);
  return { totalComments: total, negativeRate: total ? negative / total : 0, bugRate: total ? bug / total : 0,
    churnRiskRate: total ? churn / total : 0, riskIndex: calculateRiskIndex({ total, negative, bug, churnRisk: churn, averageSeverity }) };
}

async function loadClusters(projectId: string, runId: string, periodStart?: string, periodEnd?: string): Promise<ReportSummary["topComplaints"]> {
  const result = await query<ClusterRow>(
    `WITH filtered AS MATERIALIZED (
       SELECT r.id, r.platform, r.source_url, r.body, r.posted_at, r.upvotes,
              l.topic, l.sentiment, l.severity, l.is_bug, l.is_churn_risk
       FROM raw_items r JOIN analysis_labels l ON l.comment_id = r.id
       WHERE r.project_id = $1
         AND (($2::timestamptz IS NULL AND $3::timestamptz IS NULL) OR r.posted_at IS NOT NULL)
         AND ($2::timestamptz IS NULL OR r.posted_at >= $2)
         AND ($3::timestamptz IS NULL OR r.posted_at <= $3)
         AND (l.sentiment IN ('negative','mixed') OR l.is_bug)
     ), expanded AS (
       SELECT 'complaint'::text AS kind, * FROM filtered WHERE sentiment IN ('negative','mixed')
       UNION ALL SELECT 'bug'::text AS kind, * FROM filtered WHERE is_bug
     ), aggregates AS (
       SELECT kind, topic, CASE WHEN count(*) FILTER (WHERE sentiment='negative') >= count(*) / 2 THEN 'negative' ELSE 'mixed' END AS sentiment,
              count(*) AS item_count, avg(severity) AS average_severity,
              count(*) FILTER (WHERE is_churn_risk) AS churn_count
       FROM expanded GROUP BY kind, topic
     ), ranked_clusters AS (
       SELECT *, row_number() OVER (PARTITION BY kind ORDER BY item_count DESC, average_severity DESC) AS cluster_rank FROM aggregates
     ), ranked_evidence AS (
       SELECT *, row_number() OVER (PARTITION BY kind, topic ORDER BY severity DESC, upvotes DESC NULLS LAST, posted_at DESC NULLS LAST) AS evidence_rank FROM expanded
     )
     SELECT c.kind, c.topic, c.sentiment, c.item_count::text, c.average_severity::text, c.churn_count::text,
            COALESCE(jsonb_agg(jsonb_build_object('commentId',e.id,'platform',e.platform,'sourceUrl',e.source_url,'postedAt',e.posted_at,
              'excerpt',left(e.body,240),'sentiment',e.sentiment,'severity',e.severity) ORDER BY e.evidence_rank)
              FILTER (WHERE e.evidence_rank <= 5), '[]'::jsonb) AS evidence
     FROM ranked_clusters c
     LEFT JOIN ranked_evidence e ON e.kind=c.kind AND e.topic=c.topic AND e.evidence_rank <= 5
     WHERE c.cluster_rank <= 8
     GROUP BY c.kind,c.topic,c.sentiment,c.item_count,c.average_severity,c.churn_count,c.cluster_rank
     ORDER BY c.kind,c.cluster_rank`,
    [projectId, periodStart ?? null, periodEnd ?? null],
    "analysis.clusters"
  );
  return result.rows.map((row) => {
    const itemCount = Number(row.item_count);
    const severity = Number(row.average_severity);
    return { id: randomUUID(), projectId, runId, kind: row.kind, label: topicLabel(row.topic), itemCount, sentiment: row.sentiment,
      severity, summary: `${topicLabel(row.topic)}相关反馈共 ${itemCount} 条，平均严重度 ${severity.toFixed(1)}。`,
      recommendation: recommendationFor(row.topic, row.kind, Number(row.churn_count)), evidence: row.evidence ?? [], createdAt: new Date().toISOString() };
  });
}

async function loadEntityHeat(projectId: string, periodStart?: string, periodEnd?: string): Promise<ReportSummary["entityHeat"]> {
  const result = await query<{ kind: string; canonical: string; count: string; negative: string }>(
    `SELECT kind, canonical, count(*)::text AS count,
            count(*) FILTER (WHERE sentiment IN ('negative','mixed'))::text AS negative
     FROM analysis_entity_mentions
     WHERE project_id=$1
       AND (($2::timestamptz IS NULL AND $3::timestamptz IS NULL) OR posted_at IS NOT NULL)
       AND ($2::timestamptz IS NULL OR posted_at >= $2)
       AND ($3::timestamptz IS NULL OR posted_at <= $3)
     GROUP BY kind,canonical ORDER BY count(*) DESC LIMIT 20`,
    [projectId, periodStart ?? null, periodEnd ?? null],
    "analysis.entity_heat"
  );
  return result.rows.map((row) => ({ kind: row.kind as ReportSummary["entityHeat"][number]["kind"], canonical: row.canonical,
    count: Number(row.count), negativeRate: Number(row.count) ? Number(row.negative) / Number(row.count) : 0 }));
}

async function persistRunResult(runId: string, projectId: string, projectName: string, window: ResolvedWindow, summary: ReportSummary,
  markdown: string, processed: number, total: number, reused: number): Promise<string> {
  const reportId = randomUUID();
  const clusters = [...summary.topComplaints, ...summary.topBugs];
  await withTransaction(async (client) => {
    if (clusters.length > 0) {
      const values: unknown[] = [];
      const placeholders = clusters.map((cluster, index) => {
        const offset = index * 11;
        values.push(cluster.id, cluster.projectId, cluster.runId, cluster.kind, cluster.label, cluster.itemCount, cluster.sentiment,
          cluster.severity, cluster.summary, cluster.recommendation, JSON.stringify(cluster.evidence));
        return `($${offset + 1},$${offset + 2},$${offset + 3},$${offset + 4},$${offset + 5},$${offset + 6},$${offset + 7},$${offset + 8},$${offset + 9},$${offset + 10},$${offset + 11})`;
      });
      await client.query(`INSERT INTO topic_clusters (id,project_id,run_id,kind,label,item_count,sentiment,severity,summary,recommendation,evidence) VALUES ${placeholders.join(",")}`, values);
    }
    await client.query(`INSERT INTO reports (id,run_id,project_id,title,period_start,period_end,markdown,summary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [reportId, runId, projectId, `${projectName} ${window.label} 舆情报告`, window.periodStart ?? null, window.periodEnd ?? null, markdown, JSON.stringify(summary)]);
    await client.query(`UPDATE analysis_runs SET status='completed', report_id=$2, progress=$3, completed_at=now() WHERE id=$1`,
      [runId, reportId, JSON.stringify({ processed, total, reused, stage: "completed" })]);
  });
  return reportId;
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
     WHERE id = $1 AND status <> 'completed'`,
    [runId, error instanceof Error ? error.message : String(error)]
  );
}
