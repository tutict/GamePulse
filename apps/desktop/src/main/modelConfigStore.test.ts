import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ModelConfigStore } from "./modelConfigStore.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ModelConfigStore", () => {
  it("does not resolve credentials from a legacy cleartext remote endpoint", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-model-legacy-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "model-config.json");
    writeFileSync(path, JSON.stringify({
      version: 1,
      provider: "openai",
      baseUrl: "http://remote.example/v1",
      model: "legacy-model",
      encryptedApiKey: Buffer.from("legacy-secret").toString("base64"),
      apiKeyHint: "cret"
    }));
    let decrypted = false;
    const store = new ModelConfigStore(path, {
      encrypt: (value) => Buffer.from(value),
      decrypt: (value) => {
        decrypted = true;
        return Buffer.from(value).toString("utf8");
      }
    });

    expect(await store.getStatus()).toEqual({
      provider: "openai",
      baseUrl: "http://remote.example/v1",
      model: "legacy-model",
      hasApiKey: false,
      apiKeyHint: undefined
    });
    await expect(store.getResolvedConfig()).rejects.toThrow(
      "HTTPS or a loopback address"
    );
    expect(decrypted).toBe(false);
  });

  it("clears a stored API key when the endpoint changes without a replacement", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-model-endpoint-"));
    temporaryDirectories.push(directory);
    const store = new ModelConfigStore(join(directory, "model-config.json"), {
      encrypt: (value) => Buffer.from(value),
      decrypt: (value) => Buffer.from(value).toString("utf8")
    });
    await store.update({
      provider: "openai",
      baseUrl: "https://first.example/v1",
      model: "model-a",
      apiKey: "first-secret"
    });

    const status = await store.update({
      provider: "openai",
      baseUrl: "https://second.example/v1",
      model: "model-b"
    });

    expect(status.hasApiKey).toBe(false);
    expect((await store.getResolvedConfig()).apiKey).toBeUndefined();
  });

  it("persists encrypted credentials and returns only redacted status", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-model-config-"));
    temporaryDirectories.push(directory);
    const path = join(directory, "model-config.json");
    const store = new ModelConfigStore(path, {
      encrypt: (value) => Buffer.from(value).reverse(),
      decrypt: (value) => Buffer.from(value).reverse().toString("utf8")
    });

    const status = await store.update({
      provider: "openai",
      baseUrl: "https://example.test/v1",
      model: "gpt-test",
      apiKey: "sk-secret-1234"
    });

    expect(status).toEqual({
      provider: "openai",
      baseUrl: "https://example.test/v1",
      model: "gpt-test",
      hasApiKey: true,
      apiKeyHint: "1234"
    });
    expect(readFileSync(path, "utf8")).not.toContain("sk-secret-1234");
    expect((await store.getResolvedConfig()).apiKey).toBe("sk-secret-1234");
  });
});
