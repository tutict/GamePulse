import { join } from "node:path";
import { app, BrowserWindow, ipcMain, nativeTheme } from "electron";
import {
  ThemePreferenceStore,
  type NativeThemePreference
} from "./themePreferenceStore.js";
import {
  assertTrustedIpcSender,
  isTrustedRendererUrl
} from "./security.js";

let themeStore: ThemePreferenceStore | undefined;
let nativeThemeListenerRegistered = false;

export function initializeThemeService(): NativeThemePreference {
  themeStore = new ThemePreferenceStore(
    join(app.getPath("userData"), "theme-preference.json")
  );
  const preference = themeStore.get();
  nativeTheme.themeSource = preference;
  if (!nativeThemeListenerRegistered) {
    nativeTheme.on("updated", updateTrustedWindowBackgrounds);
    nativeThemeListenerRegistered = true;
  }
  return preference;
}

export function registerThemeHandlers(): void {
  ipcMain.handle("theme:set-preference", (event, value: unknown) => {
    assertTrustedIpcSender(event);
    if (!themeStore) {
      throw new Error("Theme service is not initialized");
    }
    const preference = themeStore.set(value);
    nativeTheme.themeSource = preference;
    BrowserWindow.fromWebContents(event.sender)?.setBackgroundColor(
      getThemeBackgroundColor()
    );
    return { preference };
  });
}

export function getThemeBackgroundColor(): string {
  return nativeTheme.shouldUseDarkColors ? "#171a1c" : "#e9eadf";
}

function updateTrustedWindowBackgrounds(): void {
  const backgroundColor = getThemeBackgroundColor();
  for (const window of BrowserWindow.getAllWindows()) {
    if (isTrustedRendererUrl(window.webContents.getURL())) {
      window.setBackgroundColor(backgroundColor);
    }
  }
}
