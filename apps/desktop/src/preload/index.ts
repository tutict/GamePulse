import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("gamepulse", {
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  collector: {
    captureVisible(url: string) {
      return ipcRenderer.invoke("collector:capture-visible", { url });
    }
  },
  database: {
    getStats() {
      return ipcRenderer.invoke("database:get-stats");
    },
    saveCollectorResult(result: unknown) {
      return ipcRenderer.invoke("database:save-collector-result", result);
    }
  },
  projects: {
    list() {
      return ipcRenderer.invoke("projects:list");
    },
    exportPackage(projectId: string) {
      return ipcRenderer.invoke("projects:export-package", projectId);
    },
    importPackage() {
      return ipcRenderer.invoke("projects:import-package");
    }
  },
  rag: {
    query(input: { query: string; limit?: number; projectId?: string }) {
      return ipcRenderer.invoke("rag:query", input);
    }
  },
  research: {
    list() {
      return ipcRenderer.invoke("research:list");
    },
    get(researchId: string) {
      return ipcRenderer.invoke("research:get", researchId);
    },
    start(request: { gameName: string; focus?: string }) {
      return ipcRenderer.invoke("research:start", request);
    },
    cancel(researchId: string) {
      return ipcRenderer.invoke("research:cancel", researchId);
    },
    continueIdentity(researchId: string, candidateId: string) {
      return ipcRenderer.invoke("research:continue-identity", { researchId, candidateId });
    },
    refresh(researchId: string) {
      return ipcRenderer.invoke("research:refresh", researchId);
    },
    excludeEvidence(researchId: string, evidenceId: string, reason: string) {
      return ipcRenderer.invoke("research:exclude-evidence", {
        researchId,
        evidenceId,
        reason
      });
    },
    regenerate(researchId: string) {
      return ipcRenderer.invoke("research:regenerate", researchId);
    },
    onEvent(callback: (record: unknown) => void) {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
      ipcRenderer.on("research:event", listener);
      return () => ipcRenderer.removeListener("research:event", listener);
    }
  },  models: {
    getStatus() {
      return ipcRenderer.invoke("models:get-status");
    },
    updateConfig(input: unknown) {
      return ipcRenderer.invoke("models:update-config", input);
    },
    start(input: unknown) {
      return ipcRenderer.invoke("models:start", input);
    },
    cancel(requestId: string) {
      return ipcRenderer.invoke("models:cancel", requestId);
    },
    onEvent(callback: (event: unknown) => void) {
      const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
      ipcRenderer.on("models:event", listener);
      return () => ipcRenderer.removeListener("models:event", listener);
    }
  }
});
