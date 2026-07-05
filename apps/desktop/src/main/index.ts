import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import { registerCollectorHandlers } from "./collector.js";
import { initializeDesktopDatabase, registerDatabaseHandlers } from "./database.js";
import { registerRagHandlers } from "./rag.js";

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const currentDir = dirname(fileURLToPath(import.meta.url));

function createMainWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    title: "GamePulse",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: join(currentDir, "../preload/index.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(currentDir, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  initializeDesktopDatabase();
  registerCollectorHandlers();
  registerDatabaseHandlers();
  registerRagHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
