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
import {
  initializeResearchServices,
  registerResearchHandlers,
  shutdownResearchServices
} from "./researchIpc.js";
import { isTrustedRendererUrl, openExternalIfSafe } from "./security.js";
import {
  getThemeBackgroundColor,
  initializeThemeService,
  registerThemeHandlers
} from "./themeIpc.js";

const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);
const currentDir = dirname(fileURLToPath(import.meta.url));

function createMainWindow(): void {
  const window = new BrowserWindow({
    show: false,
    width: 1440,
    height: 960,
    minWidth: 360,
    minHeight: 600,
    title: "GamePulse",
    backgroundColor: getThemeBackgroundColor(),
    webPreferences: {
      preload: join(currentDir, "../preload/index.cjs"),
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
  window.once("ready-to-show", () => window.show());

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(currentDir, "../renderer/index.html"));
  }
}

app.whenReady()
  .then(async () => {
    initializeThemeService();
    await initializeDesktopDatabase();
    initializeModelServices();
    initializeResearchServices();
    registerCollectorHandlers();
    registerDatabaseHandlers();
    registerProjectPackageHandlers();
    registerRagHandlers();
    registerResearchHandlers();
    registerModelHandlers();
    registerThemeHandlers();
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
  shutdownResearchServices();
  void shutdownDesktopDatabase();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
