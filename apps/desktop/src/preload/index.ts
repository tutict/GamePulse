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
  rag: {
    query(input: { query: string; limit?: number }) {
      return ipcRenderer.invoke("rag:query", input);
    }
  }
});
