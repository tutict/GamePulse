import { SystemBarsStyle } from "@capacitor/core";
import { describe, expect, it } from "vitest";

describe("mobile theme", () => {
  it("maps app preferences to native system bar styles", async () => {
    const modulePath = "./theme.ts";
    const themeModule = await import(/* @vite-ignore */ modulePath).catch(() => undefined);
    expect(themeModule).toBeDefined();
    if (!themeModule) {
      return;
    }

    expect(themeModule.toSystemBarsStyle("system")).toBe(SystemBarsStyle.Default);
    expect(themeModule.toSystemBarsStyle("light")).toBe(SystemBarsStyle.Light);
    expect(themeModule.toSystemBarsStyle("dark")).toBe(SystemBarsStyle.Dark);
  });
});
