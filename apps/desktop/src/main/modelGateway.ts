import type {
  ModelGateway,
  ModelRequest,
  ModelStreamEvent
} from "@gamepulse/shared";

type FetchLike = typeof fetch;
type Provider = "openai" | "ollama";

interface OpenAICompatibleGatewayOptions {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchLike;
}

interface OllamaGatewayOptions {
  baseUrl: string;
  fetch?: FetchLike;
}

export class ModelGatewayError extends Error {
  override readonly name = "ModelGatewayError";

  constructor(
    readonly provider: Provider,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly status?: number
  ) {
    super(message);
  }
}

export class OpenAICompatibleGateway implements ModelGateway {
  private readonly fetch: FetchLike;

  constructor(private readonly options: OpenAICompatibleGatewayOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const abort = createAbortContext(request.signal, request.timeoutMs);
    try {
      throwIfAborted("openai", request.signal, abort.timedOut());
      const response = await this.fetch(`${trimTrailingSlash(this.options.baseUrl)}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.2,
          stream: true
        }),
        signal: abort.signal
      });
      await assertResponse(response, "openai");
      let completed = false;

      for await (const line of readLines(response)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") {
          completed = true;
          yield { type: "done" };
          break;
        }

        const payload = JSON.parse(data) as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
        };
        const choice = payload.choices?.[0];
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
      throw normalizeError(error, "openai", request.signal, abort.timedOut());
    } finally {
      abort.cleanup();
    }
  }
}

export class OllamaGateway implements ModelGateway {
  private readonly fetch: FetchLike;

  constructor(private readonly options: OllamaGatewayOptions) {
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async *stream(request: ModelRequest): AsyncIterable<ModelStreamEvent> {
    const abort = createAbortContext(request.signal, request.timeoutMs);
    try {
      throwIfAborted("ollama", request.signal, abort.timedOut());
      const response = await this.fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          stream: true,
          options: { temperature: request.temperature ?? 0.2 }
        }),
        signal: abort.signal
      });
      await assertResponse(response, "ollama");
      let completed = false;

      for await (const line of readLines(response)) {
        if (!line.trim()) {
          continue;
        }
        const payload = JSON.parse(line) as {
          message?: { content?: string };
          response?: string;
          done?: boolean;
          done_reason?: string;
        };
        const text = payload.message?.content ?? payload.response;
        if (text) {
          yield { type: "delta", text };
        }
        if (payload.done) {
          completed = true;
          yield { type: "done", finishReason: payload.done_reason };
          break;
        }
      }

      if (!completed) {
        yield { type: "done" };
      }
    } catch (error) {
      throw normalizeError(error, "ollama", request.signal, abort.timedOut());
    } finally {
      abort.cleanup();
    }
  }
}

async function assertResponse(response: Response, provider: Provider): Promise<void> {
  if (response.ok) {
    return;
  }
  const message = (await response.text()).trim() || `${provider} request failed`;
  throw new ModelGatewayError(
    provider,
    `HTTP_${response.status}`,
    message,
    response.status === 429 || response.status >= 500,
    response.status
  );
}

async function* readLines(response: Response): AsyncIterable<string> {
  if (!response.body) {
    throw new Error("Model response body is empty");
  }

  const reader = response.body.getReader();
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
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function createAbortContext(signal: AbortSignal | undefined, timeoutMs: number | undefined): {
  signal: AbortSignal;
  timedOut(): boolean;
  cleanup(): void;
} {
  const controller = new AbortController();
  let timeoutTriggered = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromCaller();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    timeoutTriggered = true;
    controller.abort(new DOMException("Model request timed out", "TimeoutError"));
  }, Math.max(1, timeoutMs ?? 60_000));

  return {
    signal: controller.signal,
    timedOut: () => timeoutTriggered,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abortFromCaller);
    }
  };
}

function throwIfAborted(provider: Provider, signal: AbortSignal | undefined, timedOut: boolean): void {
  if (signal?.aborted) {
    throw new ModelGatewayError(provider, timedOut ? "TIMEOUT" : "CANCELLED", "Model request was cancelled", false);
  }
}

function normalizeError(
  error: unknown,
  provider: Provider,
  signal: AbortSignal | undefined,
  timedOut: boolean
): ModelGatewayError {
  if (error instanceof ModelGatewayError) {
    return error;
  }
  if (timedOut) {
    return new ModelGatewayError(provider, "TIMEOUT", "Model request timed out", true);
  }
  if (signal?.aborted || isAbortError(error)) {
    return new ModelGatewayError(provider, "CANCELLED", "Model request was cancelled", false);
  }
  return new ModelGatewayError(
    provider,
    "NETWORK_ERROR",
    error instanceof Error ? error.message : String(error),
    true
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
