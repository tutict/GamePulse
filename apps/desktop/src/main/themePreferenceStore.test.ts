import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("ThemePreferenceStore", () => {
  it("defaults to system and persists a validated preference", async () => {
    const modulePath = "./themePreferenceStore.ts";
    const themeModule = await import(/* @vite-ignore */ modulePath).catch(() => undefined);
    expect(themeModule).toBeDefined();
    if (!themeModule) {
      return;
    }

    const directory = mkdtempSync(join(tmpdir(), "gamepulse-theme-"));
    temporaryDirectories.push(directory);
    const store = new themeModule.ThemePreferenceStore(join(directory, "theme.json"));

    expect(store.get()).toBe("system");
    store.set("dark");
    expect(new themeModule.ThemePreferenceStore(join(directory, "theme.json")).get()).toBe("dark");
    expect(() => store.set("invalid")).toThrow("Invalid theme preference");
  });
});
