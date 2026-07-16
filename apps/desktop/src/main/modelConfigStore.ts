import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { dirname } from "node:path";
import { assertSecureModelBaseUrl } from "@gamepulse/shared";

export type ModelProvider = "openai" | "ollama";

export interface ModelConfigInput {
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ModelConfigStatus {
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  apiKeyHint?: string;
}

export interface ResolvedModelConfig extends ModelConfigStatus {
  apiKey?: string;
}

interface EncryptionAdapter {
  encrypt(value: string): Uint8Array;
  decrypt(value: Uint8Array): string;
}

interface StoredModelConfig {
  version: 1;
  provider: ModelProvider;
  baseUrl: string;
  model: string;
  encryptedApiKey?: string;
  apiKeyHint?: string;
}

const defaultConfig: StoredModelConfig = {
  version: 1,
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4.1-mini"
};

export class ModelConfigStore {
  constructor(
    private readonly path: string,
    private readonly encryption: EncryptionAdapter
  ) {}

  async getStatus(): Promise<ModelConfigStatus> {
    const config = this.read();
    try {
      assertSecureModelBaseUrl(config.baseUrl);
      return toStatus(config);
    } catch {
      return { ...toStatus(config), hasApiKey: false, apiKeyHint: undefined };
    }
  }

  async getResolvedConfig(): Promise<ResolvedModelConfig> {
    const config = this.read();
    return {
      ...toStatus(config),
      baseUrl: assertSecureModelBaseUrl(config.baseUrl),
      apiKey: config.encryptedApiKey
        ? this.encryption.decrypt(Buffer.from(config.encryptedApiKey, "base64"))
        : undefined
    };
  }

  async update(input: ModelConfigInput): Promise<ModelConfigStatus> {
    const current = this.read();
    const apiKey = input.apiKey?.trim();
    const endpointUnchanged = current.provider === input.provider
      && normalizeBaseUrl(current.baseUrl) === normalizeBaseUrl(input.baseUrl);
    const preserveCurrentKey = apiKey === undefined && endpointUnchanged;
    const next: StoredModelConfig = {
      version: 1,
      provider: input.provider,
      baseUrl: input.baseUrl.trim(),
      model: input.model.trim(),
      encryptedApiKey: input.provider !== "openai"
        ? undefined
        : preserveCurrentKey
        ? current.encryptedApiKey
        : apiKey
          ? Buffer.from(this.encryption.encrypt(apiKey)).toString("base64")
          : undefined,
      apiKeyHint: input.provider !== "openai"
        ? undefined
        : preserveCurrentKey
        ? current.apiKeyHint
        : apiKey
          ? apiKey.slice(-4)
          : undefined
    };

    if (!next.baseUrl || !next.model) {
      throw new Error("Model base URL and model are required");
    }

    mkdirSync(dirname(this.path), { recursive: true });
    const temporaryPath = `${this.path}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
    renameSync(temporaryPath, this.path);
    return toStatus(next);
  }

  private read(): StoredModelConfig {
    if (!existsSync(this.path)) {
      return { ...defaultConfig };
    }

    const parsed = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoredModelConfig>;
    if (parsed.version !== 1) {
      throw new Error(`Unsupported model config version: ${String(parsed.version)}`);
    }
    if (parsed.provider !== "openai" && parsed.provider !== "ollama") {
      throw new Error("Invalid model provider");
    }

    return {
      version: 1,
      provider: parsed.provider,
      baseUrl: parsed.baseUrl?.trim() || defaultConfig.baseUrl,
      model: parsed.model?.trim() || defaultConfig.model,
      encryptedApiKey: parsed.encryptedApiKey,
      apiKeyHint: parsed.apiKeyHint
    };
  }
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function toStatus(config: StoredModelConfig): ModelConfigStatus {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    hasApiKey: Boolean(config.encryptedApiKey),
    apiKeyHint: config.encryptedApiKey ? config.apiKeyHint : undefined
  };
}
