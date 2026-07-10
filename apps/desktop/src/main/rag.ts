import { ipcMain } from "electron";
import { getDesktopStore } from "./database.js";
import { runLocalRagQuery, type RagQueryInput } from "./ragService.js";
import { assertTrustedIpcSender } from "./security.js";

export function registerRagHandlers(): void {
  ipcMain.handle("rag:query", async (event, input: RagQueryInput) => {
    assertTrustedIpcSender(event);
    return runLocalRagQuery(getDesktopStore(), input);
  });
}
