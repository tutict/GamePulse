import "dotenv/config";

export interface AppConfig {
  port: number;
  host: string;
  databaseUrl: string;
  redisUrl: string;
  corsOrigin: string;
  localApiToken?: string;
  runAnalysisInline: boolean;
  modelProvider: "heuristic" | "openai" | "ollama";
  openaiBaseUrl: string;
  openaiApiKey?: string;
  openaiChatModel?: string;
  openaiEmbeddingModel?: string;
  ollamaBaseUrl: string;
  ollamaChatModel: string;
  ollamaEmbeddingModel: string;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 4317),
    host: process.env.HOST ?? "127.0.0.1",
    databaseUrl: process.env.DATABASE_URL ?? "postgres://gamepulse:gamepulse@localhost:5432/gamepulse",
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173",
    localApiToken: process.env.GAMEPULSE_API_TOKEN,
    runAnalysisInline: process.env.RUN_ANALYSIS_INLINE === "true",
    modelProvider: (process.env.MODEL_PROVIDER as AppConfig["modelProvider"]) ?? "heuristic",
    openaiBaseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiChatModel: process.env.OPENAI_CHAT_MODEL,
    openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL ?? "http://localhost:11434",
    ollamaChatModel: process.env.OLLAMA_CHAT_MODEL ?? "qwen2.5:7b",
    ollamaEmbeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "nomic-embed-text"
  };
}

