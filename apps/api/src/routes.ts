import { randomUUID } from "node:crypto";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { PLATFORMS, type Platform } from "@gamepulse/shared";
import { migrate, query } from "./db.js";
import { parseImportPayload } from "./importers.js";
import { createProject, getProject, insertIngestItems, listProjects, parsePlatform, rowToProject, toIso } from "./repository.js";
import { enqueueAnalysisRun } from "./queue.js";
import { fetchRedditPosts, fetchSteamReviews } from "./connectors.js";

const platformSchema = z.enum(PLATFORMS);

const entityAliasSchema = z.object({
  kind: z.enum(["character", "version", "system", "mode"]),
  canonical: z.string().min(1),
  aliases: z.array(z.string()).default([])
});

const versionWindowSchema = z.object({
  id: z.string().default(() => randomUUID()),
  name: z.string().min(1),
  releasedAt: z.string().datetime(),
  beforeDays: z.number().int().min(0).max(365).default(14),
  afterDays: z.number().int().min(1).max(365).default(14)
});

const projectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steamAppId: z.string().optional(),
  redditSubreddits: z.array(z.string()).default([]),
  redditKeywords: z.array(z.string()).default([]),
  sourceLinks: z
    .array(
      z.object({
        platform: platformSchema,
        url: z.string().url(),
        label: z.string().optional()
      })
    )
    .default([]),
  versionWindows: z.array(versionWindowSchema).default([]),
  entityAliases: z.array(entityAliasSchema).default([])
});

const ingestItemSchema = z.object({
  platform: platformSchema,
  body: z.string().min(1),
  sourceUrl: z.string().optional(),
  sourceTitle: z.string().optional(),
  externalId: z.string().optional(),
  authorName: z.string().optional(),
  authorId: z.string().optional(),
  authorProfileUrl: z.string().optional(),
  postedAt: z.string().optional(),
  language: z.string().optional(),
  upvotes: z.number().optional(),
  replies: z.number().optional(),
  metadata: z.record(z.unknown()).optional()
});

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"]
  });
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

  app.post("/api/imports", async (request, reply) => {
    const payload = await readImportRequest(request);
    const project = await getProject(payload.projectId);

    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const items = payload.rows ?? parseImportPayload(payload.format, payload.content ?? "", payload.defaultPlatform);
    const result = await insertIngestItems(payload.projectId, items);
    return { ...result, parsed: items.length };
  });

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
    const input = z
      .object({
        projectId: z.string(),
        versionWindowId: z.string().optional(),
        periodStart: z.string().optional(),
        periodEnd: z.string().optional(),
        sampleLimit: z.number().int().positive().optional()
      })
      .parse(request.body);
    const project = await getProject(input.projectId);

    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const runId = randomUUID();
    await query(
      `INSERT INTO analysis_runs (id, project_id, status, input, progress)
       VALUES ($1,$2,'queued',$3,$4)`,
      [runId, input.projectId, JSON.stringify(input), JSON.stringify({ processed: 0, total: 0, stage: "queued" })]
    );
    const mode = await enqueueAnalysisRun(runId);
    return reply.code(202).send({ runId, mode });
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
    const params = z
      .object({
        projectId: z.string(),
        q: z.string().optional(),
        platform: z.string().optional(),
        sentiment: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
        offset: z.coerce.number().int().min(0).default(0)
      })
      .parse(request.query);
    const platform = parsePlatform(params.platform);
    const result = await query(
      `SELECT r.id, r.platform, r.source_url, r.source_title, r.body, r.posted_at, r.collected_at, r.language,
              r.upvotes, r.replies, l.sentiment, l.topic, l.intent, l.severity, l.is_bug, l.is_churn_risk, l.entities
       FROM raw_items r
       LEFT JOIN analysis_labels l ON l.comment_id = r.id
       WHERE r.project_id = $1
         AND ($2::text IS NULL OR r.body_norm ILIKE '%' || $2 || '%')
         AND ($3::text IS NULL OR r.platform = $3)
         AND ($4::text IS NULL OR l.sentiment = $4)
       ORDER BY COALESCE(r.posted_at, r.collected_at) DESC
       LIMIT $5 OFFSET $6`,
      [params.projectId, params.q ?? null, platform ?? null, params.sentiment ?? null, params.limit, params.offset]
    );

    return {
      comments: result.rows.map((row) => ({
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
      }))
    };
  });
}

async function readImportRequest(request: FastifyRequest): Promise<{
  projectId: string;
  format: "csv" | "json";
  content?: string;
  rows?: z.infer<typeof ingestItemSchema>[];
  defaultPlatform: Platform;
}> {
  if (request.isMultipart()) {
    let projectId = "";
    let format: "csv" | "json" = "csv";
    let defaultPlatform: Platform = "import";
    let content = "";

    for await (const part of request.parts()) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        content = buffer.toString("utf8");
        format = part.filename?.toLowerCase().endsWith(".json") ? "json" : "csv";
      } else if (part.fieldname === "projectId") {
        projectId = String(part.value);
      } else if (part.fieldname === "format" && (part.value === "csv" || part.value === "json")) {
        format = part.value;
      } else if (part.fieldname === "defaultPlatform") {
        defaultPlatform = parsePlatform(part.value) ?? "import";
      }
    }

    if (!projectId || !content) {
      throw new Error("Multipart import requires projectId and file");
    }

    return { projectId, format, content, defaultPlatform };
  }

  const body = z
    .object({
      projectId: z.string(),
      format: z.enum(["csv", "json"]).default("json"),
      content: z.string().optional(),
      rows: z.array(ingestItemSchema).optional(),
      defaultPlatform: platformSchema.default("import")
    })
    .parse(request.body);

  if (!body.content && !body.rows) {
    throw new Error("Import requires content or rows");
  }

  return body;
}

function rowToReport(row: Record<string, unknown>) {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    title: row.title,
    periodStart: row.period_start ? toIso(row.period_start) : undefined,
    periodEnd: row.period_end ? toIso(row.period_end) : undefined,
    markdown: row.markdown,
    summary: row.summary,
    createdAt: toIso(row.created_at)
  };
}
