import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  const handlers = new Map<string, (event: object, input?: unknown) => unknown>();
  const state = { userDataPath: "" };
  return {
    handlers,
    state,
    app: { getPath: vi.fn(() => state.userDataPath) },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: object, input?: unknown) => unknown) => {
        handlers.set(channel, handler);
      })
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((value: string) => Buffer.from(value)),
      decryptString: vi.fn((value: Buffer) => value.toString("utf8"))
    },
    shell: { openExternal: vi.fn() }
  };
});

vi.mock("electron", () => ({
  app: electron.app,
  ipcMain: electron.ipcMain,
  safeStorage: electron.safeStorage,
  shell: electron.shell
}));

import {
  initializeModelServices,
  registerModelHandlers,
  shutdownModelServices
} from "./modelIpc.js";

const temporaryDirectories: string[] = [];
const trustedRendererUrl = new URL("../renderer/index.html", import.meta.url).href;

afterEach(() => {
  shutdownModelServices();
  electron.handlers.clear();
  vi.unstubAllGlobals();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("model catalog IPC", () => {
  it("uses a replacement key without resolving an insecure legacy endpoint", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-model-legacy-list-"));
    temporaryDirectories.push(directory);
    electron.state.userDataPath = directory;
    writeFileSync(join(directory, "model-config.json"), JSON.stringify({
      version: 1,
      provider: "openai",
      baseUrl: "http://remote.example/v1",
      model: "legacy-model",
      encryptedApiKey: Buffer.from("legacy-secret").toString("base64"),
      apiKeyHint: "cret"
    }));
    let authorization = "";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ data: [{ id: "replacement-model" }] });
    }));
    initializeModelServices();
    registerModelHandlers();
    const list = electron.handlers.get("models:list");
    const event = {
      senderFrame: { url: trustedRendererUrl },
      sender: { getURL: () => trustedRendererUrl }
    };

    await expect(list?.(event, {
      provider: "openai",
      baseUrl: "https://replacement.example/v1",
      apiKey: "replacement-secret"
    })).resolves.toEqual({ models: ["replacement-model"] });
    expect(authorization).toBe("Bearer replacement-secret");
    expect(electron.safeStorage.decryptString).not.toHaveBeenCalled();
  });

  it("rejects cleartext remote endpoints before sending an API key", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-model-https-"));
    temporaryDirectories.push(directory);
    electron.state.userDataPath = directory;
    const requestFetch = vi.fn(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", requestFetch);
    initializeModelServices();
    registerModelHandlers();
    const list = electron.handlers.get("models:list");
    const event = {
      senderFrame: { url: trustedRendererUrl },
      sender: { getURL: () => trustedRendererUrl }
    };

    await expect(list?.(event, {
      provider: "openai",
      baseUrl: "http://remote.example/v1",
      apiKey: "cleartext-secret"
    })).rejects.toThrow("HTTPS or a loopback address");
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it("does not reuse a stored API key for a different endpoint", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-model-boundary-"));
    temporaryDirectories.push(directory);
    electron.state.userDataPath = directory;
    const requestFetch = vi.fn(async () => Response.json({ data: [{ id: "unexpected" }] }));
    vi.stubGlobal("fetch", requestFetch);

    initializeModelServices();
    registerModelHandlers();
    const event = {
      senderFrame: { url: trustedRendererUrl },
      sender: { getURL: () => trustedRendererUrl }
    };
    const update = electron.handlers.get("models:update-config");
    const list = electron.handlers.get("models:list");
    await update?.(event, {
      provider: "openai",
      baseUrl: "https://trusted.example/v1",
      model: "gpt-test",
      apiKey: "stored-secret"
    });

    await expect(list?.(event, {
      provider: "openai",
      baseUrl: "https://different.example/v1"
    })).rejects.toThrow("API key is required for this endpoint");
    expect(requestFetch).not.toHaveBeenCalled();
  });

  it("uses a temporary API key without returning it to the renderer", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-model-catalog-"));
    temporaryDirectories.push(directory);
    electron.state.userDataPath = directory;
    let authorization = "";
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({ data: [{ id: "gpt-test" }] });
    }));

    initializeModelServices();
    registerModelHandlers();
    const handler = electron.handlers.get("models:list");
    expect(handler).toBeDefined();
    const event = {
      senderFrame: { url: trustedRendererUrl },
      sender: { getURL: () => trustedRendererUrl }
    };

    await expect(handler?.(event, {
      provider: "openai",
      baseUrl: "https://catalog.example/v1",
      apiKey: "temporary-secret"
    })).resolves.toEqual({ models: ["gpt-test"] });
    expect(authorization).toBe("Bearer temporary-secret");
    expect(JSON.stringify(await handler?.(event, {
      provider: "openai",
      baseUrl: "https://catalog.example/v1",
      apiKey: "temporary-secret"
    }))).not.toContain("temporary-secret");
  });
});
