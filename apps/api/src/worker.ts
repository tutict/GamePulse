import { Worker } from "bullmq";
import { closePool, migrate } from "./db.js";
import { failRun, runAnalysis } from "./analysisRunner.js";
import { createRedisConnectionOptions, getQueueName, type AnalysisJobData } from "./queue.js";

await migrate();

const worker = new Worker<AnalysisJobData>(
  getQueueName(),
  async (job) => {
    try {
      await runAnalysis(job.data.runId);
    } catch (error) {
      await failRun(job.data.runId, error);
      throw error;
    }
  },
  { connection: createRedisConnectionOptions(), concurrency: 2 }
);

worker.on("completed", (job) => {
  console.log(`Analysis run completed: ${job.data.runId}`);
});

worker.on("failed", (job, error) => {
  console.error(`Analysis run failed: ${job?.data.runId}`, error);
});

const shutdown = async () => {
  await worker.close();
  await closePool();
};

process.on("SIGINT", () => {
  void shutdown().then(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().then(() => process.exit(0));
});
