import { Queue, type ConnectionOptions } from "bullmq";
import { loadConfig } from "./config.js";
import { runAnalysis, failRun } from "./analysisRunner.js";

const queueName = "analysis-runs";
let queue: Queue | undefined;

export interface AnalysisJobData {
  runId: string;
}

export function getQueue(): Queue<AnalysisJobData> {
  if (!queue) {
    queue = new Queue<AnalysisJobData>(queueName, { connection: createRedisConnectionOptions() });
  }

  return queue as Queue<AnalysisJobData>;
}

export function getQueueName(): string {
  return queueName;
}

export function createRedisConnectionOptions(): ConnectionOptions {
  const config = loadConfig();
  const url = new URL(config.redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname ? Number(url.pathname.replace("/", "") || 0) : 0,
    maxRetriesPerRequest: null
  };
}

export async function enqueueAnalysisRun(runId: string): Promise<"queued" | "inline"> {
  const config = loadConfig();

  if (config.runAnalysisInline) {
    setImmediate(() => {
      runAnalysis(runId).catch((error: unknown) => {
        void failRun(runId, error);
      });
    });
    return "inline";
  }

  try {
    await getQueue().add("run", { runId }, { attempts: 2, backoff: { type: "exponential", delay: 3000 } });
    return "queued";
  } catch (error) {
    setImmediate(() => {
      runAnalysis(runId).catch((failure: unknown) => {
        void failRun(runId, failure);
      });
    });
    return "inline";
  }
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }

}
