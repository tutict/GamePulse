import { randomUUID } from "node:crypto";
import multipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { migrate, query } from "./db.js";
import { handleImportRequest } from "./importService.js";
import { createProject, getProject, insertIngestItems, listProjects, parsePlatform, toIso } from "./repository.js";
import { enqueueAnalysisRun, QueueUnavailableError } from "./queue.js";
import { fetchRedditPosts, fetchSteamReviews } from "./connectors.js";
import { loadConfig } from "./config.js";
import { registerHttpSecurity } from "./httpSecurity.js";
import { rowToReport } from "./reportMapper.js";
import { ingestItemSchema, projectSchema } from "./schemas.js";
import { buildCommentSearchQuery } from "./commentSearch.js";

const searchQuerySchema = z.object({
  projectId: z.string(),
  q: z.string().optional(),
  platform: z.string().optional(),
  sentiment: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  before: z.string().datetime().optional(),
  cursorAt: z.string().datetime().optional(),
  cursorId: z.string().optional()
});

const analysisRunSchema = z.object({
  projectId: z.string(),
  versionWindowId: z.string().optional(),
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  sampleLimit: z.number().int().positive().optional()
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  const config = loadConfig();

  await registerHttpSecurity(app, config);
  await app.register(multipart, {
    limits: {
      fileSize: 1024 * 1024 * 200
    }
  });

  app.get("/api/health", async () => {
    return { ok: true, service: "gamepulse-api" };
  });

  app.post("/api/db/migrate", async () => {
    await migrate();
    return { ok: true };
  });

  app.get("/api/projects", async () => {
    return { projects: await listProjects() };
  });

  app.post("/api/projects", async (request, reply) => {
    const input = projectSchema.parse(request.body);
    const project = await createProject(input);
    return reply.code(201).send({ project });
  });

  app.get("/api/projects/:projectId", async (request, reply) => {
    const params = z.object({ projectId: z.string() }).parse(request.params);
    const project = await getProject(params.projectId);

    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    return { project };
  });

  app.post("/api/ingest/batch", async (request, reply) => {
    const body = z
      .object({
        projectId: z.string().min(1),
        items: z.array(ingestItemSchema).min(1).max(5000)
      })
      .parse(request.body);

    const project = await getProject(body.projectId);

    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    return insertIngestItems(body.projectId, body.items);
  });

  app.post("/api/imports", async (request, reply) => handleImportRequest(request, reply));

  app.post("/api/connectors/steam/reviews", async (request, reply) => {
    const body = z
      .object({
        projectId: z.string(),
        appId: z.string(),
        language: z.string().optional(),
        maxPages: z.number().int().min(1).max(10).optional()
      })
      .parse(request.body);
    const project = await getProject(body.projectId);

    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    return fetchSteamReviews(body);
  });

  app.post("/api/connectors/reddit/search", async (request, reply) => {
    const body = z
      .object({
        projectId: z.string(),
        query: z.string().min(1),
        subreddit: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional()
      })
      .parse(request.body);
    const project = await getProject(body.projectId);

    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    return fetchRedditPosts(body);
  });

  app.post("/api/analysis/runs", async (request, reply) => {
    const input = analysisRunSchema.parse(request.body);
    const project = await getProject(input.projectId);

    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const runId = randomUUID();
    await query(
      `INSERT INTO analysis_runs (id, project_id, status, input, progress)
       VALUES ($1,$2,'queued',$3,$4)`,
      [runId, input.projectId, JSON.stringify(input), JSON.stringify({ processed: 0, total: 0, reused: 0, stage: "queued" })]
    );
    try {
      const mode = await enqueueAnalysisRun(runId);
      return reply.code(202).send({ runId, mode });
    } catch (error) {
      if (error instanceof QueueUnavailableError) {
        return reply.code(503).send({ error: "queue_unavailable", runId });
      }
      throw error;
    }
  });

  app.get("/api/analysis/runs/:runId", async (request, reply) => {
    const params = z.object({ runId: z.string() }).parse(request.params);
    const result = await query("SELECT * FROM analysis_runs WHERE id = $1", [params.runId]);
    const row = result.rows[0];

    if (!row) {
      return reply.code(404).send({ error: "Run not found" });
    }

    return {
      run: {
        id: row.id,
        projectId: row.project_id,
        status: row.status,
        input: row.input,
        progress: row.progress,
        reportId: row.report_id,
        error: row.error,
        createdAt: toIso(row.created_at),
        startedAt: row.started_at ? toIso(row.started_at) : undefined,
        completedAt: row.completed_at ? toIso(row.completed_at) : undefined
      }
    };
  });

  app.get("/api/reports", async (request) => {
    const queryString = z.object({ projectId: z.string().optional() }).parse(request.query);
    const result = await query(
      `SELECT id, run_id, project_id, title, period_start, period_end, markdown, summary, created_at
       FROM reports
       WHERE ($1::text IS NULL OR project_id = $1)
       ORDER BY created_at DESC
       LIMIT 50`,
      [queryString.projectId ?? null]
    );

    return { reports: result.rows.map(rowToReport) };
  });

  app.get("/api/reports/:reportId", async (request, reply) => {
    const params = z.object({ reportId: z.string() }).parse(request.params);
    const result = await query("SELECT * FROM reports WHERE id = $1", [params.reportId]);
    const row = result.rows[0];

    if (!row) {
      return reply.code(404).send({ error: "Report not found" });
    }

    return { report: rowToReport(row) };
  });

  app.get("/api/comments/search", async (request) => {
    const params = searchQuerySchema.parse(request.query);
    const platform = parsePlatform(params.platform);
    const search = buildCommentSearchQuery({ ...params, platform });
    const result = await query(search.text, search.values, "comments.search");
    const hasMore = result.rows.length > search.requestedLimit;
    const rows = result.rows.slice(0, search.requestedLimit);
    const lastRow = rows.at(-1);

    return {
      comments: rows.map((row) => ({
        id: row.id,
        platform: row.platform,
        sourceUrl: row.source_url,
        sourceTitle: row.source_title,
        body: row.body,
        postedAt: row.posted_at ? toIso(row.posted_at) : undefined,
        collectedAt: toIso(row.collected_at),
        language: row.language,
        upvotes: row.upvotes,
        replies: row.replies,
        label: row.sentiment
          ? {
              sentiment: row.sentiment,
              topic: row.topic,
              intent: row.intent,
              severity: row.severity,
              isBug: row.is_bug,
              isChurnRisk: row.is_churn_risk,
              entities: row.entities
            }
          : undefined
      })),
      nextCursor: hasMore && lastRow ? { at: toIso(lastRow.effective_at), id: lastRow.id } : null
    };
  });
}
