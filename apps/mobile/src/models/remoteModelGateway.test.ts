import { afterEach, describe, expect, it, vi } from "vitest";

const nativeHttp = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  get: vi.fn(),
  post: vi.fn()
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: nativeHttp.isNativePlatform },
  CapacitorHttp: { get: nativeHttp.get, post: nativeHttp.post }
}));

import { RemoteModelGateway } from "./remoteModelGateway.js";

afterEach(() => {
  vi.clearAllMocks();
  nativeHttp.isNativePlatform.mockReturnValue(false);
});

describe("RemoteModelGateway model discovery", () => {
  it("lists models from an OpenAI-compatible endpoint", async () => {
    const gateway = new RemoteModelGateway(
      {
        apiKey: "mobile-secret",
        baseUrl: "https://mobile.example/v1",
        model: ""
      },
      async (input, init) => {
        expect(String(input)).toBe("https://mobile.example/v1/models");
        expect(new Headers(init?.headers).get("authorization")).toBe(
          "Bearer mobile-secret"
        );
        return Response.json({ data: [{ id: "model-b" }, { id: "model-a" }] });
      }
    );

    expect(await gateway.listModels()).toEqual(["model-a", "model-b"]);
  });

  it("uses native HTTP for Android chat requests without relying on CORS", async () => {
    nativeHttp.isNativePlatform.mockReturnValue(true);
    nativeHttp.post.mockResolvedValue({
      status: 200,
      headers: {},
      url: "https://mobile.example/v1/chat/completions",
      data: {
        choices: [{
          message: { content: "native answer" },
          finish_reason: "stop"
        }]
      }
    });
    const gateway = new RemoteModelGateway({
      apiKey: "mobile-secret",
      baseUrl: "https://mobile.example/v1",
      model: "model-a"
    });
    const events = [];

    for await (const event of gateway.stream({
      model: "model-a",
      messages: [{ role: "user", content: "question" }]
    })) {
      events.push(event);
    }

    expect(nativeHttp.post).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://mobile.example/v1/chat/completions",
      data: expect.objectContaining({ model: "model-a", stream: false })
    }));
    expect(events).toEqual([
      { type: "delta", text: "native answer" },
      { type: "done", finishReason: "stop" }
    ]);
  });
});
