import { ipcMain, type WebContents } from "electron";
import {
  DeterministicReportGenerator,
  FixtureResearchCollector,
  type ResearchRecord
} from "@gamepulse/shared";
import { getDesktopStore } from "./database.js";
import { DesktopResearchService } from "./researchService.js";
import { assertTrustedIpcSender } from "./security.js";

let service: DesktopResearchService | undefined;

export function initializeResearchServices(): void {
  service = new DesktopResearchService({
    repository: getDesktopStore(),
    collector: new FixtureResearchCollector(),
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