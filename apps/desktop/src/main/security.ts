import { shell, type IpcMainInvokeEvent } from "electron";

const devRendererUrl = process.env.ELECTRON_RENDERER_URL;

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

    return url.protocol === "file:";
  } catch {
    return false;
  }
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
