import { randomUUID } from "node:crypto";
import { z } from "zod";
import { PLATFORMS } from "@gamepulse/shared";

export const platformSchema = z.enum(PLATFORMS);

export const entityAliasSchema = z.object({
  kind: z.enum(["character", "version", "system", "mode"]),
  canonical: z.string().min(1),
  aliases: z.array(z.string()).default([])
});

export const versionWindowSchema = z.object({
  id: z.string().default(() => randomUUID()),
  name: z.string().min(1),
  releasedAt: z.string().datetime(),
  beforeDays: z.number().int().min(0).max(365).default(14),
  afterDays: z.number().int().min(1).max(365).default(14)
});

export const projectSchema = z.object({
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

export const ingestItemSchema = z.object({
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
  metadata: z.record(z.string(), z.unknown()).optional()
});

export const importRequestSchema = z.object({
  projectId: z.string(),
  format: z.enum(["csv", "json"]).default("json"),
  content: z.string().optional(),
  rows: z.array(ingestItemSchema).optional(),
  defaultPlatform: platformSchema.default("import")
});
