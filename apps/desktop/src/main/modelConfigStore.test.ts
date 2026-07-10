import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
