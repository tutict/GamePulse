import { SecureStorage } from "@aparajita/capacitor-secure-storage";

const configKey = "gamepulse.remote-model";
const apiKeyKey = "gamepulse.remote-model.api-key";

export interface RemoteModelConfigInput {
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface RemoteModelConfigStatus {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyHint?: string;
}

interface StoredRemoteModelConfig extends Record<string, unknown> {
  baseUrl: string;
  model: string;
}

export interface ResolvedRemoteModelConfig extends StoredRemoteModelConfig {
  apiKey: string;
}

export async function getRemoteModelStatus(): Promise<RemoteModelConfigStatus> {
  const config = await readConfig();
  const apiKey = await readApiKey();
  return {
    ...config,
    hasApiKey: Boolean(apiKey),
    apiKeyHint: apiKey ? `${apiKey.slice(0, 3)}...${apiKey.slice(-3)}` : undefined
  };
}

export async function saveRemoteModelConfig(
  input: RemoteModelConfigInput
): Promise<RemoteModelConfigStatus> {
  const config: StoredRemoteModelConfig = {
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model.trim()
  };
  if (!config.baseUrl || !config.model) {
    throw new Error("Base URL and model are required");
  }

  await SecureStorage.set(configKey, config);
  if (input.apiKey !== undefined) {
    const apiKey = input.apiKey.trim();
    if (apiKey) {
      await SecureStorage.set(apiKeyKey, apiKey);
    } else {
      await SecureStorage.remove(apiKeyKey);
    }
  }
  return getRemoteModelStatus();
}

export async function resolveRemoteModelConfig(): Promise<ResolvedRemoteModelConfig> {
  const config = await readConfig();
  const apiKey = await readApiKey();
  if (!apiKey) {
    throw new Error("Remote model API key is not configured");
  }
  return { ...config, apiKey };
}

async function readConfig(): Promise<StoredRemoteModelConfig> {
  const stored = await SecureStorage.get(configKey);
  if (isStoredConfig(stored)) {
    return {
      baseUrl: normalizeBaseUrl(stored.baseUrl),
      model: stored.model.trim()
    };
  }
  return {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4.1-mini"
  };
}

async function readApiKey(): Promise<string> {
  const value = await SecureStorage.get(apiKeyKey);
  return typeof value === "string" ? value : "";
}

function isStoredConfig(value: unknown): value is StoredRemoteModelConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.baseUrl === "string" && typeof candidate.model === "string";
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}
