import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { BrowserWindow, dialog, ipcMain, type WebContents } from "electron";
import {
  buildResearchDocument,
  DeterministicReportGenerator,
  encodeResearchDocx,
  renderResearchDocumentHtml,
  researchDocumentFileName,
  type ResearchDocumentFormat,
  type ResearchRecord
} from "@gamepulse/shared";
import { ChromiumResearchPageReader } from "./chromiumResearchPageReader.js";
import { getDesktopStore } from "./database.js";
import { LiveResearchCollector } from "./liveResearchCollector.js";
import { DesktopResearchService } from "./researchService.js";
import { assertTrustedIpcSender } from "./security.js";

let service: DesktopResearchService | undefined;

export function initializeResearchServices(): void {
  service = new DesktopResearchService({
    repository: getDesktopStore(),
    collector: new LiveResearchCollector(new ChromiumResearchPageReader()),
    reportGenerator: new DeterministicReportGenerator()
  });
}

export function registerResearchHandlers(): void {
  ipcMain.handle("research:list", (event) => {
    assertTrustedIpcSender(event);
    return requireService().list();
  });
  ipcMain.handle("research:get", (event, researchId: unknown) => {
    assertTrustedIpcSender(event);
    return requireService().get(requiredString(researchId, "Research id", 200));
  });
  ipcMain.handle("research:start", (event, value: unknown) => {
    assertTrustedIpcSender(event);
    const request = validateResearchRequest(value);
    return requireService().start(request, createProgressSender(event.sender));
  });
  ipcMain.handle("research:cancel", (event, researchId: unknown) => {
    assertTrustedIpcSender(event);
    return requireService().cancel(requiredString(researchId, "Research id", 200));
  });
  ipcMain.handle("research:continue-identity", (event, value: unknown) => {
    assertTrustedIpcSender(event);
    const input = validateRecord(value);
    return requireService().continueWithIdentity(
      requiredString(input.researchId, "Research id", 200),
      requiredString(input.candidateId, "Candidate id", 200),
      createProgressSender(event.sender)
    );
  });
  ipcMain.handle("research:refresh", (event, researchId: unknown) => {
    assertTrustedIpcSender(event);
    return requireService().refresh(
      requiredString(researchId, "Research id", 200),
      createProgressSender(event.sender)
    );
  });
  ipcMain.handle("research:exclude-evidence", (event, value: unknown) => {
    assertTrustedIpcSender(event);
    const input = validateRecord(value);
    return requireService().excludeEvidence(
      requiredString(input.researchId, "Research id", 200),
      requiredString(input.evidenceId, "Evidence id", 200),
      requiredString(input.reason, "Exclusion reason", 300)
    );
  });
  ipcMain.handle("research:regenerate", (event, researchId: unknown) => {
    assertTrustedIpcSender(event);
    return requireService().regenerate(requiredString(researchId, "Research id", 200));
  });
  ipcMain.handle("research:export-document", async (event, value: unknown) => {
    assertTrustedIpcSender(event);
    const input = validateRecord(value);
    const researchId = requiredString(input.researchId, "Research id", 200);
    const format = validateDocumentFormat(input.format);
    const research = await requireService().get(researchId);
    if (!research) {
      throw new Error("Research was not found");
    }
    const document = buildResearchDocument(research);
    const fileName = researchDocumentFileName(document, format);
    const parent = BrowserWindow.fromWebContents(event.sender);
    const save = parent
      ? await dialog.showSaveDialog(parent, saveDialogOptions(fileName, format))
      : await dialog.showSaveDialog(saveDialogOptions(fileName, format));
    if (save.canceled || !save.filePath) {
      return { canceled: true };
    }
    const filePath = ensureDocumentExtension(save.filePath, format);
    const bytes = format === "docx"
      ? encodeResearchDocx(document)
      : await printResearchPdf(renderResearchDocumentHtml(document));
    await writeFile(filePath, bytes);
    return {
      canceled: false,
      filePath,
      fileName: basename(filePath),
      format,
      bytes: bytes.byteLength
    };
  });
}

export function shutdownResearchServices(): void {
  service?.cancelAll();
  service = undefined;
}

function createProgressSender(sender: WebContents): (research: ResearchRecord) => void {
  return (research) => {
    if (!sender.isDestroyed()) {
      sender.send("research:event", research);
    }
  };
}

function validateResearchRequest(value: unknown): { gameName: string; focus?: string } {
  const input = validateRecord(value);
  const focus = optionalString(input.focus, 500);
  return {
    gameName: requiredString(input.gameName, "Game name", 120),
    focus
  };
}

function validateRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Research request must be an object");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`${label} must not exceed ${maxLength} characters`);
  }
  return normalized;
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error("Research focus must be a string");
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`Research focus must not exceed ${maxLength} characters`);
  }
  return normalized || undefined;
}

function requireService(): DesktopResearchService {
  if (!service) {
    throw new Error("Research services are not initialized");
  }
  return service;
}

function validateDocumentFormat(value: unknown): ResearchDocumentFormat {
  if (value !== "docx" && value !== "pdf") {
    throw new Error("Document format must be docx or pdf");
  }
  return value;
}

function saveDialogOptions(
  fileName: string,
  format: ResearchDocumentFormat
): Electron.SaveDialogOptions {
  return {
    title: "导出研究报告",
    defaultPath: fileName,
    filters: [{
      name: format === "docx" ? "Word 文档" : "PDF 文档",
      extensions: [format]
    }]
  };
}

function ensureDocumentExtension(
  filePath: string,
  format: ResearchDocumentFormat
): string {
  return extname(filePath).toLowerCase() === `.${format}`
    ? filePath
    : `${filePath}.${format}`;
}

async function printResearchPdf(html: string): Promise<Uint8Array> {
  let directory: string | undefined;
  let preview: BrowserWindow | undefined;
  try {
    directory = await mkdtemp(join(tmpdir(), "gamepulse-report-"));
    const htmlPath = join(directory, "report.html");
    await writeFile(htmlPath, html, "utf8");
    preview = new BrowserWindow({
      show: false,
      backgroundColor: "#ffffff",
      webPreferences: {
        contextIsolation: true,
        javascript: false,
        nodeIntegration: false,
        sandbox: true
      }
    });
    preview.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    await preview.loadFile(htmlPath);
    return await preview.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: "A4"
    });
  } finally {
    if (preview && !preview.isDestroyed()) {
      preview.destroy();
    }
    if (directory) {
      await rm(directory, { recursive: true, force: true });
    }
  }
}
