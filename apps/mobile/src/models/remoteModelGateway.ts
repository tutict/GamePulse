import { Capacitor, CapacitorHttp } from "@capacitor/core";
import type {
  ModelGateway,
  ModelRequest,
  ModelStreamEvent
} from "@gamepulse/shared";
import type { ResolvedRemoteModelConfig } from "./secureModelConfig.js";

export class RemoteModelGateway implements ModelGateway {
  private readonly requestFetch: typeof fetch;
  private readonly useNativeHttp: boolean;

  constructor(
    private readonly config: ResolvedRemoteModelConfig,
    requestFetch?: typeof fetch
  ) {
    this.requestFetch = requestFetch ?? globalThis.fetch;
    this.useNativeHttp = requestFetch === undefined;
  }

  async listModels(options: {
    signal?: AbortSignal;
    timeoutMs?: number;
  } = {}): Promise<string[]> {
    const abort = createAbortContext(options.signal, options.timeoutMs ?? 15_000);
    try {
      const url = `${this.config.baseUrl.replace(/\/+$/, "")}/models`;
      if (this.useNativeHttp && Capacitor.isNativePlatform()) {
        if (options.signal?.aborted) {
          throw new Error("Model list request was cancelled");
        }
        const timeout = Math.max(1, options.timeoutMs ?? 15_000);
        const response = await CapacitorHttp.get({
          url,
          headers: { authorization: `Bearer ${this.config.apiKey}` },
          connectTimeout: timeout,
          readTimeout: timeout
        });
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            response.data?.error?.message
              ?? `Model list request failed with HTTP ${response.status}`
          );
        }
        const payload = typeof response.data === "string"
          ? JSON.parse(response.data) as unknown
          : response.data;
        return parseModelList(payload);
      }
      const response = await this.requestFetch(
        url,
        {
          headers: { authorization: `Bearer ${this.config.apiKey}` },
          signal: abort.signal
        }
      );
      if (!response.ok) {
        const body = (await response.text()).trim();
        throw new Error(body || `Model list request failed with HTTP ${response.status}`);
      }
      return parseModelList(await response.json());
    } catch (error) {
      if (abort.timedOut()) {
        throw new Error("Model list request timed out");
      }
      if (options.signal?.aborted) {
        throw new Error("Model list request was cancelled");
      }
      throw error;
    } finally {
      abort.cleanup();
    }
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const abort = createAbortContext(request.signal, request.timeoutMs);
    try {
      if (this.useNativeHttp && Capacitor.isNativePlatform()) {
        if (abort.signal.aborted) {
          throw new Error("Remote model request was cancelled");
        }
        const timeout = Math.max(1, request.timeoutMs ?? 60_000);
        const response = await CapacitorHttp.post({
          url: `${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`,
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`
          },
          data: {
            model: request.model,
            messages: request.messages,
            temperature: request.temperature ?? 0.2,
            stream: false
          },
          connectTimeout: timeout,
          readTimeout: timeout
        });
        if (abort.signal.aborted) {
          throw new Error("Remote model request was cancelled");
        }
        if (response.status < 200 || response.status >= 300) {
          throw new Error(
            nativeErrorMessage(response.data)
              ?? `Remote model request failed with HTTP ${response.status}`
          );
        }
        const payload = parseNativePayload(response.data);
        const choice = firstChoice(payload);
        if (choice.text) {
          yield { type: "delta", text: choice.text };
        }
        yield { type: "done", finishReason: choice.finishReason };
        return;
      }
      const response = await this.requestFetch(
        `${this.config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.config.apiKey}`
          },
          body: JSON.stringify({
            model: request.model,
            messages: request.messages,
            temperature: request.temperature ?? 0.2,
            stream: true
          }),
          signal: abort.signal
        }
      );
      if (!response.ok) {
        const body = (await response.text()).trim();
        throw new Error(body || `Remote model request failed with HTTP ${response.status}`);
      }
      if (!response.body) {
        throw new Error("Remote model response body is empty");
      }

      let completed = false;
      for await (const line of readLines(response.body)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          completed = true;
          yield { type: "done" };
          break;
        }
        const parsed = JSON.parse(payload) as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
        };
        const choice = parsed.choices?.[0];
        if (choice?.delta?.content) {
          yield { type: "delta", text: choice.delta.content };
        }
        if (choice?.finish_reason) {
          completed = true;
          yield { type: "done", finishReason: choice.finish_reason };
          break;
        }
      }
      if (!completed) {
        yield { type: "done" };
      }
    } catch (error) {
      if (abort.timedOut()) {
        throw new Error("Remote model request timed out");
      }
      if (request.signal?.aborted) {
        throw new Error("Remote model request was cancelled");
      }
      throw error;
    } finally {
      abort.cleanup();
    }
  }
}

async function* readLines(stream: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        yield buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
      if (done) {
        if (buffer) {
          yield buffer;
        }
        return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function createAbortContext(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined
): {
  signal: AbortSignal;
  timedOut(): boolean;
  cleanup(): void;
} {
  const controller = new AbortController();
  let timeoutTriggered = false;
  const relay = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    relay();
  } else {
    signal?.addEventListener("abort", relay, { once: true });
  }
  const timeout = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort();
  }, Math.max(1, timeoutMs ?? 60_000));

  return {
    signal: controller.signal,
    timedOut: () => timeoutTriggered,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", relay);
    }
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseModelList(payload: unknown): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw new Error("OpenAI-compatible model list response is invalid");
  }
  return [...new Set(payload.data.map((item) =>
    isRecord(item) && typeof item.id === "string" ? item.id.trim() : ""
  ).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function parseNativePayload(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function nativeErrorMessage(value: unknown): string | undefined {
  const payload = parseNativePayload(value);
  if (!isRecord(payload) || !isRecord(payload.error)) {
    return undefined;
  }
  return typeof payload.error.message === "string" ? payload.error.message : undefined;
}

function firstChoice(payload: unknown): { text: string; finishReason?: string } {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) {
    throw new Error("Remote model response is invalid");
  }
  const choice = payload.choices[0];
  const message = isRecord(choice.message) ? choice.message : undefined;
  if (!message || typeof message.content !== "string") {
    throw new Error("Remote model response is invalid");
  }
  return {
    text: message.content,
    finishReason: typeof choice.finish_reason === "string"
      ? choice.finish_reason
      : undefined
  };
}
