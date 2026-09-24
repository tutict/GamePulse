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

  it("uses one shared theme-token source across both clients", () => {
    const desktopStyles = readFileSync(
      join(root, "apps/desktop/src/renderer/src/styles.css"),
      "utf8"
    );
    const mobileStyles = readFileSync(
      join(root, "apps/mobile/src/styles.css"),
      "utf8"
    );
    const sharedTheme = readFileSync(
      join(root, "packages/ui/src/styles/theme.css"),
      "utf8"
    );

    expect(desktopStyles).toContain(
      '@import "../../../../../packages/ui/src/styles/theme.css";'
    );
    expect(mobileStyles).toContain(
      '@import "../../../packages/ui/src/styles/theme.css";'
    );
    expect(desktopStyles).not.toMatch(/--gp-background\s*:/);
    expect(mobileStyles).not.toMatch(/--gp-background\s*:/);
    expect(sharedTheme).toContain("--gp-background:");
    expect(sharedTheme).toContain(':root[data-theme="dark"]');
  });

  it("keeps semantic text and focus colors above WCAG AA contrast thresholds", () => {
    const theme = readFileSync(
      join(root, "packages/ui/src/styles/theme.css"),
      "utf8"
    );
    const schemes = [
      {
        name: "light",
        block: theme.match(/:root\s*\{([^}]*)\}/)?.[1]
      },
      {
        name: "dark",
        block: theme.match(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/)?.[1]
      }
    ];
    const toTokens = (block: string) => Object.fromEntries(
      [...block.matchAll(/--gp-([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)]
        .map(([, name, h, s, l]) => [name, [Number(h), Number(s), Number(l)] as const])
    );
    const toRgb = ([h, s, l]: readonly number[]) => {
      s /= 100;
      l /= 100;
      const a = s * Math.min(l, 1 - l);
      return [0, 8, 4].map((n) => {
        const k = (n + h / 30) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      });
    };
    const luminance = (color: readonly number[]) => {
      const [r, g, b] = toRgb(color).map((value) =>
        value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
      );
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const contrast = (foreground: readonly number[], background: readonly number[]) => {
      const first = luminance(foreground);
      const second = luminance(background);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    const textPairs = [
      ["foreground", "background"],
      ["muted-foreground", "background"],
      ["muted-foreground", "card"],
      ["card-foreground", "card"],
      ["primary-foreground", "primary"],
      ["secondary-foreground", "secondary"],
      ["accent-foreground", "accent"],
      ["destructive-foreground", "destructive"],
      ["destructive", "background"]
    ] as const;

    for (const scheme of schemes) {
      expect(scheme.block, `${scheme.name} theme tokens`).toBeTruthy();
      if (!scheme.block) continue;
      const tokens = toTokens(scheme.block);
      for (const [foregroundName, backgroundName] of textPairs) {
        expect(
          contrast(tokens[foregroundName]!, tokens[backgroundName]!)
        ).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tokens.ring!, tokens.background!)).toBeGreaterThanOrEqual(3);
      expect(contrast(tokens.positive!, tokens.background!)).toBeGreaterThanOrEqual(3);
      expect(contrast(tokens.neutral!, tokens.background!)).toBeGreaterThanOrEqual(3);
    }
  });

  it("uses a restrained slate and teal product palette", () => {
    const theme = readFileSync(
      join(root, "packages/ui/src/styles/theme.css"),
      "utf8"
    );

    expect(theme).toContain("--gp-background: 204 18% 96%;");
    expect(theme).toContain("--gp-primary: 211 31% 25%;");
    expect(theme).toContain("--gp-accent: 171 29% 87%;");
    expect(theme).toContain("--gp-ring: 171 45% 36%;");
    expect(theme).toContain("--gp-input: 204 14% 66%;");
    expect(theme).toContain("--gp-input: 204 14% 48%;");
    expect(theme).toContain("--gp-background: 211 19% 12%;");
    expect(theme).toContain("--gp-primary: 174 28% 31%;");
    expect(theme).toContain("--gp-accent: 173 22% 24%;");
  });
  it("keeps Tailwind semantic mappings in the shared theme entry", () => {
    const desktopStyles = readFileSync(
      join(root, "apps/desktop/src/renderer/src/styles.css"),
      "utf8"
    );
    const mobileStyles = readFileSync(
      join(root, "apps/mobile/src/styles.css"),
      "utf8"
    );
    const sharedTheme = readFileSync(
      join(root, "packages/ui/src/styles/theme.css"),
      "utf8"
    );

    expect(sharedTheme).toContain("@theme inline");
    expect(sharedTheme).toContain("--color-background");
    expect(sharedTheme).toContain("--radius-md");
    expect(desktopStyles).not.toContain("@theme inline");
    expect(mobileStyles).not.toContain("@theme inline");
  });});
