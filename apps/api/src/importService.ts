import { parse as parseCsvStream } from "csv-parse";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { IngestItem, Platform } from "@gamepulse/shared";
import { mapRowToIngestItem, parseImportPayload } from "./importers.js";
import { getProject, insertIngestItems, parsePlatform } from "./repository.js";
import { importRequestSchema, type ingestItemSchema } from "./schemas.js";
import type { z } from "zod";

export interface ImportResult {
  accepted: number;
  inserted: number;
  parsed: number;
}

export async function handleImportRequest(request: FastifyRequest, reply: FastifyReply): Promise<ImportResult | FastifyReply> {
  if (request.isMultipart()) {
    return handleMultipartImport(request, reply);
  }

  const payload = readImportRequest(request.body);
  const project = await getProject(payload.projectId);

  if (!project) {
    return reply.code(404).send({ error: "Project not found" });
  }

  const items = payload.rows ?? parseImportPayload(payload.format, payload.content ?? "", payload.defaultPlatform);
  const result = await insertIngestItems(payload.projectId, items);
  return { ...result, parsed: items.length };
}

async function handleMultipartImport(request: FastifyRequest, reply: FastifyReply): Promise<ImportResult | FastifyReply> {
  let projectId = "";
  let defaultPlatform: Platform = "import";
  let accepted = 0;
  let inserted = 0;
  let parsed = 0;
  let sawFile = false;

  for await (const part of request.parts()) {
    if (part.type !== "file") {
      if (part.fieldname === "projectId") {
        projectId = String(part.value);
      } else if (part.fieldname === "defaultPlatform") {
        defaultPlatform = parsePlatform(part.value) ?? "import";
      }
      continue;
    }

    sawFile = true;
    if (!projectId) {
      return reply.code(400).send({ error: "Multipart import requires projectId before file" });
    }

    const project = await getProject(projectId);
    if (!project) {
      return reply.code(404).send({ error: "Project not found" });
    }

    const result = await importFile(projectId, defaultPlatform, part.filename ?? "", part.file, () => part.toBuffer());
    accepted += result.accepted;
    inserted += result.inserted;
    parsed += result.parsed;
  }

  if (!projectId || !sawFile) {
    return reply.code(400).send({ error: "Multipart import requires projectId and file" });
  }

  return { accepted, inserted, parsed };
}

async function importFile(
  projectId: string,
  defaultPlatform: Platform,
  filename: string,
  stream: NodeJS.ReadableStream,
  readBuffer: () => Promise<Buffer>
): Promise<ImportResult> {
  if (filename.toLowerCase().endsWith(".json")) {
    const buffer = await readBuffer();
    const items = parseImportPayload("json", buffer.toString("utf8"), defaultPlatform);
    const result = await insertIngestItems(projectId, items);
    return { ...result, parsed: items.length };
  }

  return ingestCsvStream(projectId, defaultPlatform, stream);
}

async function ingestCsvStream(projectId: string, defaultPlatform: Platform, stream: NodeJS.ReadableStream): Promise<ImportResult> {
  const parser = stream.pipe(
    parseCsvStream({
      bom: true,
      columns: true,
      skip_empty_lines: true,
      trim: true
    })
  ) as AsyncIterable<Record<string, unknown>>;
  const batch: IngestItem[] = [];
  let accepted = 0;
  let inserted = 0;
  let parsed = 0;

  for await (const row of parser) {
    parsed += 1;
    const item = mapRowToIngestItem(row, defaultPlatform);
    if (!item.body.trim()) {
      continue;
    }

    batch.push(item);
    if (batch.length >= 1000) {
      const result = await insertIngestItems(projectId, batch.splice(0, batch.length));
      accepted += result.accepted;
      inserted += result.inserted;
    }
  }

  if (batch.length > 0) {
    const result = await insertIngestItems(projectId, batch);
    accepted += result.accepted;
    inserted += result.inserted;
  }

  return { accepted, inserted, parsed };
}

function readImportRequest(body: unknown): {
  projectId: string;
  format: "csv" | "json";
  content?: string;
  rows?: z.infer<typeof ingestItemSchema>[];
  defaultPlatform: Platform;
} {
  const payload = importRequestSchema.parse(body);

  if (!payload.content && !payload.rows) {
    throw new Error("Import requires content or rows");
  }

  return payload;
}
