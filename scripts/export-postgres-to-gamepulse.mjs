import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GamePulseProjectPackageCodec } from "../packages/shared/dist/index.js";

const queries = {
  project: `
    SELECT jsonb_build_object(
      'id', id,
      'name', name,
      'description', description,
      'steamAppId', steam_app_id,
      'redditSubreddits', reddit_subreddits,
      'redditKeywords', reddit_keywords,
      'sourceLinks', source_links,
      'versionWindows', version_windows,
      'entityAliases', entity_aliases,
      'createdAt', created_at,
      'updatedAt', updated_at
    )::text
    FROM projects
    WHERE id = :'project_id'
  `,
  comments: `
    SELECT jsonb_build_object(
      'id', id,
      'projectId', project_id,
      'platform', platform,
      'sourceUrl', source_url,
      'sourceTitle', source_title,
      'externalId', external_id,
      'body', body,
      'bodyNorm', body_norm,
      'authorHash', author_hash,
      'postedAt', posted_at,
      'collectedAt', collected_at,
      'language', language,
      'upvotes', upvotes,
      'replies', replies,
      'contentHash', content_hash,
      'metadata', metadata
    )::text
    FROM raw_items
    WHERE project_id = :'project_id'
    ORDER BY collected_at, id
  `,
  labels: `
    SELECT jsonb_build_object(
      'commentId', label.comment_id,
      'sentiment', label.sentiment,
      'topic', label.topic,
      'intent', label.intent,
      'severity', label.severity,
      'isBug', label.is_bug,
      'isChurnRisk', label.is_churn_risk,
      'entities', label.entities,
      'confidence', label.confidence,
      'rationale', label.rationale,
      'model', label.model
    )::text
    FROM analysis_labels label
    JOIN raw_items item ON item.id = label.comment_id
    WHERE item.project_id = :'project_id'
    ORDER BY label.comment_id
  `,
  reports: `
    SELECT jsonb_build_object(
      'id', id,
      'runId', run_id,
      'projectId', project_id,
      'title', title,
      'periodStart', period_start,
      'periodEnd', period_end,
      'markdown', markdown,
      'summary', summary,
      'createdAt', created_at
    )::text
    FROM reports
    WHERE project_id = :'project_id'
    ORDER BY created_at, id
  `
};

export function parseArguments(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument?.startsWith("--")) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const key = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    index += 1;
  }

  return {
    databaseUrl: options["database-url"] || process.env.DATABASE_URL,
    projectId: options["project-id"],
    out: options.out,
    psql: options.psql || "psql"
  };
}

export function normalizeSnapshot({ project, comments, labels, reports }, exportedAt = new Date().toISOString()) {
  if (!project) {
    throw new Error("Project was not found in PostgreSQL");
  }

  return {
    formatVersion: 1,
    exportedAt,
    project: normalizeDates(project, ["createdAt", "updatedAt"]),
    comments: comments.map((comment) => normalizeDates(comment, ["postedAt", "collectedAt"])),
    labels,
    reports: reports.map((report) => normalizeDates(report, ["periodStart", "periodEnd", "createdAt"]))
  };
}

export async function exportProject(options) {
  if (!options.databaseUrl) {
    throw new Error("DATABASE_URL or --database-url is required");
  }
  if (!options.projectId) {
    throw new Error("--project-id is required");
  }

  const [project] = await queryJsonRows(options, queries.project);
  const [comments, labels, reports] = await Promise.all([
    queryJsonRows(options, queries.comments),
    queryJsonRows(options, queries.labels),
    queryJsonRows(options, queries.reports)
  ]);
  const snapshot = normalizeSnapshot({ project, comments, labels, reports });
  const codec = new GamePulseProjectPackageCodec();
  const bytes = await codec.encode(snapshot);
  const outputPath = resolve(options.out || `${safeFileName(snapshot.project.name)}.gamepulse`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  return {
    outputPath,
    projectId: snapshot.project.id,
    comments: snapshot.comments.length,
    labels: snapshot.labels.length,
    reports: snapshot.reports.length,
    bytes: bytes.byteLength
  };
}

async function queryJsonRows(options, sql) {
  const args = [
    options.databaseUrl,
    "--no-psqlrc",
    "--no-align",
    "--tuples-only",
    "--set",
    "ON_ERROR_STOP=1",
    "--set",
    `project_id=${options.projectId}`,
    "--command",
    sql
  ];
  const output = await run(options.psql, args);
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, PGCONNECT_TIMEOUT: process.env.PGCONNECT_TIMEOUT || "10" },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(stdout);
      } else {
        reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
      }
    });
  });
}

function normalizeDates(value, keys) {
  const result = { ...value };
  for (const key of keys) {
    if (result[key]) {
      result[key] = new Date(result[key]).toISOString();
    } else {
      delete result[key];
    }
  }
  return result;
}

function safeFileName(value) {
  const normalized = String(value || "gamepulse-project")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return normalized || "gamepulse-project";
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await exportProject(options);
  console.log(
    `Exported ${result.projectId}: ${result.comments} comments, ${result.labels} labels, ` +
      `${result.reports} reports -> ${result.outputPath} (${result.bytes} bytes)`
  );
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
