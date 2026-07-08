import cors from "@fastify/cors";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.js";

export async function registerHttpSecurity(
  app: FastifyInstance,
  config: Pick<AppConfig, "corsOrigin" | "localApiToken">
): Promise<void> {
  const allowedOrigins = parseCorsOrigins(config.corsOrigin);

  await app.register(cors, {
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.has(origin));
    },
    methods: ["GET", "POST", "OPTIONS"]
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!config.localApiToken || request.method === "OPTIONS" || request.url === "/api/health") {
      return;
    }

    const token = readRequestToken(request);
    if (token !== config.localApiToken) {
      return reply.code(401).send({ error: "Unauthorized" });
    }
  });
}

export function parseCorsOrigins(value: string): Set<string> {
  return new Set(
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

export function readRequestToken(request: FastifyRequest): string | undefined {
  const headerValue = request.headers["x-gamepulse-token"];
  if (typeof headerValue === "string") {
    return headerValue;
  }

  const authorization = request.headers.authorization;
  if (authorization?.startsWith("Bearer ")) {
    return authorization.slice("Bearer ".length);
  }

  return undefined;
}
