import { join } from "node:path";
import { app, ipcMain, safeStorage } from "electron";
import type { ModelMessage, ModelStreamEvent } from "@gamepulse/shared";
import { ModelConfigStore, type ModelConfigInput } from "./modelConfigStore.js";
import {
  ModelGatewayError,
  OllamaGateway,
  OpenAICompatibleGateway
} from "./modelGateway.js";
import { assertTrustedIpcSender } from "./security.js";

interface ModelStartInput {
  requestId: string;
  messages: ModelMessage[];
  timeoutMs?: number;
  temperature?: number;
}

let configStore: ModelConfigStore | undefined;
const activeRequests = new Map<string, AbortController>();

export function initializeModelServices(): void {
  configStore = new ModelConfigStore(
    join(app.getPath("userData"), "model-config.json"),
    {
      encrypt(value) {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("Secure credential storage is unavailable on this device");
        }
        return safeStorage.encryptString(value);
      },
      decrypt(value) {
        if (!safeStorage.isEncryptionAvailable()) {
          throw new Error("Secure credential storage is unavailable on this device");
        }
        return safeStorage.decryptString(Buffer.from(value));
      }
    }
  );
}

export function registerModelHandlers(): void {
  ipcMain.handle("models:get-status", async (event) => {
    assertTrustedIpcSender(event);
    return requireConfigStore().getStatus();
  });
  ipcMain.handle("models:update-config", async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    return requireConfigStore().update(validateConfigInput(input));
  });
  ipcMain.handle("models:start", async (event, input: unknown) => {
    assertTrustedIpcSender(event);
    const request = validateStartInput(input);
    const controller = new AbortController();
    activeRequests.get(request.requestId)?.abort();
    activeRequests.set(request.requestId, controller);
    const sender = event.sender;

    try {
      const config = await requireConfigStore().getResolvedConfig();
      const gateway = config.provider === "ollama"
        ? new OllamaGateway({ baseUrl: config.baseUrl })
        : new OpenAICompatibleGateway({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey ?? requireOpenAiKey()
          });
      for await (const modelEvent of gateway.stream({
        model: config.model,
        messages: request.messages,
        timeoutMs: request.timeoutMs,
        temperature: request.temperature,
        signal: controller.signal
      })) {
        sender.send("models:event", { requestId: request.requestId, event: modelEvent });
      }
      return { completed: true };
    } catch (error) {
      sender.send("models:event", {
        requestId: request.requestId,
        event: toErrorEvent(error)
      });
      return { completed: false };
    } finally {
      activeRequests.delete(request.requestId);
    }
  });
  ipcMain.handle("models:cancel", (event, requestId: unknown) => {
    assertTrustedIpcSender(event);
    const id = typeof requestId === "string" ? requestId : "";
    const controller = activeRequests.get(id);
    controller?.abort();
    return { cancelled: Boolean(controller) };
  });
}

export function shutdownModelServices(): void {
  for (const controller of activeRequests.values()) {
    controller.abort();
  }
  activeRequests.clear();
  configStore = undefined;
}

function requireConfigStore(): ModelConfigStore {
  if (!configStore) {
    throw new Error("Model services are not initialized");
  }
  return configStore;
}

function requireOpenAiKey(): never {
  throw new Error("OpenAI-compatible API key is not configured");
}

function validateConfigInput(value: unknown): ModelConfigInput {
  if (!isRecord(value)) {
    throw new Error("Model configuration must be an object");
  }
  const provider = value.provider;
  if (provider !== "openai" && provider !== "ollama") {
    throw new Error("Model provider must be openai or ollama");
  }
  return {
    provider,
    baseUrl: stringValue(value.baseUrl),
    model: stringValue(value.model),
    apiKey: value.apiKey === undefined ? undefined : stringValue(value.apiKey)
  };
}

function validateStartInput(value: unknown): ModelStartInput {
  if (!isRecord(value) || !Array.isArray(value.messages)) {
    throw new Error("Model start request is invalid");
  }
  const messages = value.messages
    .slice(0, 64)
    .map((message): ModelMessage => {
      if (!isRecord(message)) {
        throw new Error("Model message is invalid");
      }
      const role = message.role;
      if (role !== "system" && role !== "user" && role !== "assistant") {
        throw new Error("Model message role is invalid");
      }
      return { role, content: stringValue(message.content).slice(0, 100_000) };
    });

  return {
    requestId: stringValue(value.requestId),
    messages,
    timeoutMs: numberValue(value.timeoutMs),
    temperature: numberValue(value.temperature)
  };
}

function toErrorEvent(error: unknown): ModelStreamEvent {
  if (error instanceof ModelGatewayError) {
    return {
      type: "error",
      code: error.code,
      message: error.message,
      retryable: error.retryable
    };
  }
  return {
    type: "error",
    code: "MODEL_ERROR",
    message: error instanceof Error ? error.message : String(error),
    retryable: false
  };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
