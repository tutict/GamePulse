import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

const storageKey = "gamepulse-theme";
const darkMediaQuery = "(prefers-color-scheme: dark)";

export function useThemePreference() {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(readSystemDark);
  const resolvedTheme: ResolvedTheme =
    preference === "system" ? (systemDark ? "dark" : "light") : preference;

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const media = window.matchMedia(darkMediaQuery);
    const handleChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    setSystemDark(media.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setPreference(parsePreference(event.newValue));
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useLayoutEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.dataset.theme = resolvedTheme;
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
    document
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute("content", resolvedTheme === "dark" ? "#171a1c" : "#e9eadf");
  }, [resolvedTheme]);

  const updatePreference = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      window.localStorage.setItem(storageKey, next);
    } catch {
      // Theme still applies for the current session when storage is unavailable.
    }
  }, []);

  return { preference, resolvedTheme, setPreference: updatePreference };
}

function readPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }
  try {
    return parsePreference(window.localStorage.getItem(storageKey));
  } catch {
    return "system";
  }
}

function parsePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

function readSystemDark(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(darkMediaQuery).matches;
}
