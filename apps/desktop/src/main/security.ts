import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { shell, type IpcMainInvokeEvent } from "electron";

const devRendererUrl = process.env.ELECTRON_RENDERER_URL;
const rendererEntryPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../renderer/index.html"
);

export function assertTrustedIpcSender(event: IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url || event.sender.getURL();
  if (!isTrustedRendererUrl(senderUrl)) {
    throw new Error("Rejected IPC call from untrusted renderer");
  }
}

export function isTrustedRendererUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);

    if (devRendererUrl) {
      return url.origin === new URL(devRendererUrl).origin;
    }

    if (url.protocol !== "file:") {
      return false;
    }
    url.hash = "";
    url.search = "";
    return comparablePath(fileURLToPath(url)) === comparablePath(rendererEntryPath);
  } catch {
    return false;
  }
}

function comparablePath(value: string): string {
  const resolved = resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export async function openExternalIfSafe(rawUrl: string): Promise<void> {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "http:" || url.protocol === "https:") {
      await shell.openExternal(url.href);
    }
  } catch {
    // Ignore malformed external navigation requests.
  }
}
