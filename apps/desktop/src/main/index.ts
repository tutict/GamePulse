import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { registerCollectorHandlers } from "./collector.js";
import {
  initializeDesktopDatabase,
  registerDatabaseHandlers,
  shutdownDesktopDatabase
} from "./database.js";
import {
  initializeModelServices,
  registerModelHandlers,
  shutdownModelServices
} from "./modelIpc.js";
import { registerProjectPackageHandlers } from "./projectPackageIpc.js";
import { registerRagHandlers } from "./rag.js";
import { isTrustedRendererUrl, openExternalIfSafe } from "./security.js";

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
      sandbox: true
    }
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void openExternalIfSafe(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!isTrustedRendererUrl(url)) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(currentDir, "../renderer/index.html"));
  }
}

app.whenReady()
  .then(async () => {
    await initializeDesktopDatabase();
    initializeModelServices();
    registerCollectorHandlers();
    registerDatabaseHandlers();
    registerProjectPackageHandlers();
    registerRagHandlers();
    registerModelHandlers();
    createMainWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  })
  .catch((error) => {
    console.error("Failed to initialize GamePulse desktop.", error);
    app.quit();
  });

app.on("before-quit", () => {
  shutdownModelServices();
  void shutdownDesktopDatabase();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
