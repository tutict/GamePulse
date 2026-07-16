import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => {
  const values = new Map<string, unknown>();
  return {
    values,
    api: {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: unknown) => {
        values.set(key, value);
      }),
      remove: vi.fn(async (key: string) => {
        values.delete(key);
      })
    }
  };
});

vi.mock("@aparajita/capacitor-secure-storage", () => ({
  SecureStorage: storage.api
}));

import {
  getRemoteModelStatus,
  resolveRemoteModelConfig,
  saveRemoteModelConfig
} from "./secureModelConfig.js";

beforeEach(() => {
  storage.values.clear();
  vi.clearAllMocks();
});

describe("secure remote model config", () => {
  it("does not resolve a legacy API key over cleartext remote HTTP", async () => {
    storage.values.set("gamepulse.remote-model", {
      baseUrl: "http://remote.example/v1",
      model: "legacy-model"
    });
    storage.values.set("gamepulse.remote-model.api-key", "legacy-secret");

    expect(await getRemoteModelStatus()).toEqual({
      baseUrl: "http://remote.example/v1",
      model: "legacy-model",
      hasApiKey: false,
      apiKeyHint: undefined
    });
    await expect(resolveRemoteModelConfig()).rejects.toThrow(
      "HTTPS or a loopback address"
    );
  });

  it("allows a malformed legacy endpoint to be replaced", async () => {
    storage.values.set("gamepulse.remote-model", {
      baseUrl: "remote.example/v1",
      model: "legacy-model"
    });
    storage.values.set("gamepulse.remote-model.api-key", "legacy-secret");

    expect(await getRemoteModelStatus()).toEqual({
      baseUrl: "remote.example/v1",
      model: "legacy-model",
      hasApiKey: false,
      apiKeyHint: undefined
    });
    await saveRemoteModelConfig({
      baseUrl: "https://replacement.example/v1",
      model: "replacement-model",
      apiKey: "replacement-secret"
    });
    await expect(resolveRemoteModelConfig()).resolves.toEqual({
      baseUrl: "https://replacement.example/v1",
      model: "replacement-model",
      apiKey: "replacement-secret"
    });
  });

  it("rejects cleartext remote endpoints", async () => {
    await expect(saveRemoteModelConfig({
      baseUrl: "http://remote.example/v1",
      model: "model-a",
      apiKey: "cleartext-secret"
    })).rejects.toThrow("HTTPS or a loopback address");
    expect(storage.api.set).not.toHaveBeenCalled();
  });

  it("clears the stored API key when the endpoint changes", async () => {
    await saveRemoteModelConfig({
      baseUrl: "https://first.example/v1",
      model: "model-a",
      apiKey: "mobile-secret"
    });
    await saveRemoteModelConfig({
      baseUrl: "https://second.example/v1",
      model: "model-b"
    });

    await expect(resolveRemoteModelConfig()).rejects.toThrow(
      "Remote model API key is not configured"
    );
  });
});
