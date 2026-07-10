import { createReadStream } from "node:fs";
import { writeFile } from "node:fs/promises";
import { basename } from "node:path";
import { BrowserWindow, dialog, ipcMain } from "electron";
import { getDesktopStore } from "./database.js";
import { ProjectPackageService } from "./projectPackageService.js";
import { assertTrustedIpcSender } from "./security.js";

const packageFilter = [{ name: "GamePulse Project", extensions: ["gamepulse"] }];

export function registerProjectPackageHandlers(): void {
  ipcMain.handle("projects:list", async (event) => {
    assertTrustedIpcSender(event);
    return getDesktopStore().listProjects();
  });

  ipcMain.handle("projects:export-package", async (event, projectIdValue: unknown) => {
    assertTrustedIpcSender(event);
    const projectId = requiredString(projectIdValue, "Project id");
    const store = getDesktopStore();
    const project = await store.getProject(projectId);
    if (!project) {
      throw new Error(`Project not found: ${projectId}`);
    }

    const result = await showSaveDialog(event.sender, {
      title: "Export GamePulse project",
      defaultPath: `${safeFileName(project.name)}.gamepulse`,
      filters: packageFilter
    });
    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const bytes = await new ProjectPackageService(store).exportProject(projectId);
    await writeFile(result.filePath, bytes);
    return {
      canceled: false,
      filePath: result.filePath,
      fileName: basename(result.filePath),
      projectId,
      bytes: bytes.byteLength
    };
  });

  ipcMain.handle("projects:import-package", async (event) => {
    assertTrustedIpcSender(event);
    const result = await showOpenDialog(event.sender, {
      title: "Import GamePulse project",
      properties: ["openFile"],
      filters: packageFilter
    });
    const filePath = result.filePaths[0];
    if (result.canceled || !filePath) {
      return { canceled: true };
    }

    const merge = await new ProjectPackageService(getDesktopStore())
      .importProjectStream(createReadStream(filePath));
    return {
      canceled: false,
      filePath,
      fileName: basename(filePath),
      ...merge
    };
  });
}

function showSaveDialog(
  sender: Electron.WebContents,
  options: Electron.SaveDialogOptions
): Promise<Electron.SaveDialogReturnValue> {
  const parent = BrowserWindow.fromWebContents(sender);
  return parent ? dialog.showSaveDialog(parent, options) : dialog.showSaveDialog(options);
}

function showOpenDialog(
  sender: Electron.WebContents,
  options: Electron.OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> {
  const parent = BrowserWindow.fromWebContents(sender);
  return parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function safeFileName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  return sanitized || "gamepulse-project";
}
