import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type NativeThemePreference = "system" | "light" | "dark";

interface StoredThemePreference {
  version: 1;
  preference: NativeThemePreference;
}

export class ThemePreferenceStore {
  constructor(private readonly path: string) {}

  get(): NativeThemePreference {
    if (!existsSync(this.path)) {
      return "system";
    }
    try {
      const stored = JSON.parse(readFileSync(this.path, "utf8")) as Partial<StoredThemePreference>;
      if (stored.version !== 1) {
        return "system";
      }
      return parseThemePreference(stored.preference);
    } catch {
      return "system";
    }
  }

  set(value: unknown): NativeThemePreference {
    const preference = parseThemePreference(value);
    const stored: StoredThemePreference = { version: 1, preference };
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    return preference;
  }
}

export function parseThemePreference(value: unknown): NativeThemePreference {
  if (value === "system" || value === "light" || value === "dark") {
    return value;
  }
  throw new Error("Invalid theme preference");
}
