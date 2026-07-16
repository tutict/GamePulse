import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const electron = vi.hoisted(() => {
  type MockIpcEvent = {
    sender: { getURL(): string };
    senderFrame?: { url: string };
  };
  const handlers = new Map<string, (event: MockIpcEvent, value: unknown) => unknown>();
  const state = { source: "system", userDataPath: "", dark: false };
  const setBackgroundColor = vi.fn();
  const updatedListeners: Array<() => void> = [];
  const trustedRendererUrl = new URL("../renderer/index.html", import.meta.url).href;
  const mainWindow = {
    setBackgroundColor,
    webContents: { getURL: () => trustedRendererUrl }
  };
  return {
    handlers,
    state,
    setBackgroundColor,
    updatedListeners,
    app: { getPath: vi.fn(() => state.userDataPath) },
    ipcMain: {
      handle: vi.fn((channel: string, handler: (event: MockIpcEvent, value: unknown) => unknown) => {
        handlers.set(channel, handler);
      })
    },
    nativeTheme: {
      get themeSource() {
        return state.source;
      },
      set themeSource(value: string) {
        state.source = value;
        state.dark = value === "dark";
      },
      get shouldUseDarkColors() {
        return state.dark;
      },
      on: vi.fn((event: string, listener: () => void) => {
        if (event === "updated") {
          updatedListeners.push(listener);
        }
      })
    },
    BrowserWindow: {
      fromWebContents: vi.fn(() => mainWindow),
      getAllWindows: vi.fn(() => [mainWindow])
    },
    shell: { openExternal: vi.fn() }
  };
});

vi.mock("electron", () => ({
  app: electron.app,
  BrowserWindow: electron.BrowserWindow,
  ipcMain: electron.ipcMain,
  nativeTheme: electron.nativeTheme,
  shell: electron.shell
}));

import {
  initializeThemeService,
  registerThemeHandlers
} from "./themeIpc.js";

const temporaryDirectories: string[] = [];
const trustedRendererUrl = new URL("../renderer/index.html", import.meta.url).href;

afterEach(() => {
  electron.handlers.clear();
  electron.setBackgroundColor.mockClear();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("theme IPC", () => {
  it("persists renderer preferences and synchronizes the native window", () => {
    const directory = mkdtempSync(join(tmpdir(), "gamepulse-theme-ipc-"));
    temporaryDirectories.push(directory);
    electron.state.userDataPath = directory;

    expect(initializeThemeService()).toBe("system");
    registerThemeHandlers();
    const handler = electron.handlers.get("theme:set-preference");
    expect(handler).toBeDefined();
    expect(() => handler?.({
      senderFrame: { url: "https://untrusted.example/" },
      sender: { getURL: () => "https://untrusted.example/" }
    }, "dark")).toThrow("Rejected IPC call from untrusted renderer");

    expect(handler?.({
      senderFrame: { url: trustedRendererUrl },
      sender: { getURL: () => trustedRendererUrl }
    }, "dark")).toEqual({ preference: "dark" });
    expect(electron.state.source).toBe("dark");
    expect(electron.setBackgroundColor).toHaveBeenCalledWith("#171a1c");
    expect(readFileSync(join(directory, "theme-preference.json"), "utf8")).toContain(
      '"preference": "dark"'
    );

    handler?.({
      senderFrame: { url: trustedRendererUrl },
      sender: { getURL: () => trustedRendererUrl }
    }, "system");
    electron.state.dark = true;
    electron.setBackgroundColor.mockClear();
    for (const listener of electron.updatedListeners) {
      listener();
    }
    expect(electron.setBackgroundColor).toHaveBeenCalledWith("#171a1c");
  });
});
