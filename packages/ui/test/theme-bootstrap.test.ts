// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const root = process.cwd();
const bootstrapPath = join(root, "packages/ui/public/theme-bootstrap.js");

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
  document.documentElement.style.removeProperty("color-scheme");
  document.querySelector('meta[name="theme-color"]')?.remove();
  vi.unstubAllGlobals();
});

describe("theme bootstrap", () => {
  it("loads before React in both clients and restores an explicit dark preference", () => {
    const scriptTag = '<script vite-ignore src="./theme-bootstrap.js"></script>';
    const desktopHtml = readFileSync(
      join(root, "apps/desktop/src/renderer/index.html"),
      "utf8"
    );
    const mobileHtml = readFileSync(join(root, "apps/mobile/index.html"), "utf8");
    const desktopBuild = readFileSync(
      join(root, "apps/desktop/scripts/build.mjs"),
      "utf8"
    );
    const desktopDev = readFileSync(join(root, "apps/desktop/scripts/dev.mjs"), "utf8");

    expect(desktopHtml).toContain(scriptTag);
    expect(mobileHtml).toContain(scriptTag);
    expect(desktopBuild).toContain(
      'publicDir: resolve(appDir, "../../packages/ui/public")'
    );
    expect(desktopDev).toContain(
      'publicDir: resolve(appDir, "../../packages/ui/public")'
    );
    expect(existsSync(bootstrapPath)).toBe(true);
    if (!existsSync(bootstrapPath)) {
      return;
    }

    const meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
    window.localStorage.setItem("gamepulse-theme", "dark");
    vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));

    new Function(readFileSync(bootstrapPath, "utf8"))();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(meta.content).toBe("#171a1c");
  });
});
