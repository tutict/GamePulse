import type {
  ModelGateway,
  ModelRequest,
  ModelStreamEvent
} from "@gamepulse/shared";
import type { ResolvedRemoteModelConfig } from "./secureModelConfig.js";

export class RemoteModelGateway implements ModelGateway {
  constructor(
    private readonly config: ResolvedRemoteModelConfig,
    private readonly requestFetch: typeof fetch = globalThis.fetch
  ) {}

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const abort = createAbortContext(request.signal, request.timeoutMs);
    try {
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
