import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { loadConfig } from "./config.js";
import { closePool, migrate } from "./db.js";
import { registerRoutes } from "./routes.js";
import { closeQueue } from "./queue.js";

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: "info"
    },
    bodyLimit: 1024 * 1024 * 50
  });

  await registerRoutes(app);
  return app;
}

const isEntrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

if (isEntrypoint) {
  const config = loadConfig();
  const app = await buildServer();

  await migrate();
  await app.listen({ host: config.host, port: config.port });

  const shutdown = async () => {
    await app.close();
    await closeQueue();
    await closePool();
  };

  process.on("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
}
