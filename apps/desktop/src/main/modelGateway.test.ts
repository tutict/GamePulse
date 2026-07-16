import { describe, expect, it } from "vitest";
import type { ModelRequest, ModelStreamEvent } from "@gamepulse/shared";
import {
  OllamaGateway,
  OpenAICompatibleGateway
} from "./modelGateway.js";

const request: ModelRequest = {
  model: "test-model",
  messages: [{ role: "user", content: "hello" }]
};

describe("model gateways", () => {
  it("lists and normalizes OpenAI-compatible models", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const gateway = new OpenAICompatibleGateway({
      apiKey: "secret",
      baseUrl: "https://example.test/v1/",
      fetch: async (input, init) => {
        requests.push({ input, init });
        return Response.json({
          data: [{ id: "gpt-z" }, { id: "gpt-a" }, { id: "gpt-a" }, { id: "" }]
        });
      }
    });

    expect(await gateway.listModels()).toEqual(["gpt-a", "gpt-z"]);
    expect(String(requests[0]?.input)).toBe("https://example.test/v1/models");
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(
      "Bearer secret"
    );
  });

  it("lists installed Ollama models", async () => {
    const gateway = new OllamaGateway({
      baseUrl: "http://127.0.0.1:11434/",
      fetch: async (input) => {
        expect(String(input)).toBe("http://127.0.0.1:11434/api/tags");
        return Response.json({
          models: [
            { name: "qwen3:8b" },
            { model: "deepseek-r1:7b" },
            { name: "qwen3:8b" }
          ]
        });
      }
    });

    expect(await gateway.listModels()).toEqual(["deepseek-r1:7b", "qwen3:8b"]);
  });

  it("streams OpenAI-compatible SSE responses", async () => {
    const gateway = new OpenAICompatibleGateway({
      apiKey: "secret",
      baseUrl: "https://example.test/v1",
      fetch: async () => response([
        'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
        "data: [DONE]\n\n"
      ])
    });

    expect(await collect(gateway.stream(request))).toEqual([
      { type: "delta", text: "你" },
      { type: "delta", text: "好" },
      { type: "done" }
    ]);
  });

  it("streams Ollama NDJSON responses", async () => {
    const gateway = new OllamaGateway({
      baseUrl: "http://127.0.0.1:11434",
      fetch: async () => response([
        '{"message":{"content":"本地"},"done":false}\n',
        '{"message":{"content":"回答"},"done":false}\n',
        '{"done":true,"done_reason":"stop"}\n'
      ])
    });

    expect(await collect(gateway.stream(request))).toEqual([
      { type: "delta", text: "本地" },
      { type: "delta", text: "回答" },
      { type: "done", finishReason: "stop" }
    ]);
  });

  it("reports cancellation and timeout through one error type", async () => {
    const fetch = (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    const gateway = new OpenAICompatibleGateway({
      apiKey: "secret",
      baseUrl: "https://example.test/v1",
      fetch
    });
    const controller = new AbortController();
    controller.abort();

    await expect(collect(gateway.stream({ ...request, signal: controller.signal }))).rejects.toMatchObject({
      code: "CANCELLED"
    });
    await expect(collect(gateway.stream({ ...request, timeoutMs: 5 }))).rejects.toMatchObject({
      code: "TIMEOUT"
    });
  });

  it("normalizes provider HTTP failures", async () => {
    const gateway = new OllamaGateway({
      baseUrl: "http://127.0.0.1:11434",
      fetch: async () => new Response("unavailable", { status: 503 })
    });

    await expect(collect(gateway.stream(request))).rejects.toMatchObject({
      code: "HTTP_503",
      provider: "ollama",
      retryable: true
    });
  });
});

async function collect(stream: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> {
  const events: ModelStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function response(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  }), { status: 200 });
}
