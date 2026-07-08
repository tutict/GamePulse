import { BrowserWindow, ipcMain } from "electron";
import { assertTrustedIpcSender } from "./security.js";

export interface CollectorItem {
  body: string;
  platform: string;
  sourceUrl: string;
  sourceTitle: string;
  selector: string;
}

export interface CollectorResult {
  url: string;
  title: string;
  platform: string;
  itemCount: number;
  items: CollectorItem[];
}

export function registerCollectorHandlers(): void {
  ipcMain.handle("collector:capture-visible", async (event, input: { url?: string }) => {
    assertTrustedIpcSender(event);
    return captureVisibleText(input?.url ?? "");
  });
}

async function captureVisibleText(rawUrl: string): Promise<CollectorResult> {
  const url = parseHttpUrl(rawUrl);
  const collectorWindow = new BrowserWindow({
    show: false,
    width: 1366,
    height: 920,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "persist:gamepulse-collector"
    }
  });

  collectorWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  try {
    await loadUrlWithTimeout(collectorWindow, url.href, 25_000);
    await delay(1_500);
    await autoScrollPage(collectorWindow);

    const result = (await collectorWindow.webContents.executeJavaScript(buildExtractionScript(), true)) as CollectorResult;
    return result;
  } finally {
    if (!collectorWindow.isDestroyed()) {
      collectorWindow.close();
    }
  }
}

function parseHttpUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new Error("Collector URL is required");
  }

  const url = new URL(trimmed);

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Collector only supports http and https URLs");
  }

  return url;
}

function loadUrlWithTimeout(window: BrowserWindow, url: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out loading ${url}`));
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timer);
      window.webContents.removeListener("did-finish-load", onFinish);
      window.webContents.removeListener("did-fail-load", onFail);
    };

    const onFinish = () => {
      cleanup();
      resolve();
    };

    const onFail = (_event: Electron.Event, errorCode: number, errorDescription: string) => {
      cleanup();
      reject(new Error(`Failed to load page (${errorCode}): ${errorDescription}`));
    };

    window.webContents.once("did-finish-load", onFinish);
    window.webContents.once("did-fail-load", onFail);
    void window.loadURL(url);
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function autoScrollPage(window: BrowserWindow): Promise<void> {
  await window.webContents.executeJavaScript(
    `new Promise((resolve) => {
      let distance = 0;
      const step = Math.max(360, Math.floor(window.innerHeight * 0.7));
      const timer = setInterval(() => {
        window.scrollBy(0, step);
        distance += step;
        if (distance >= Math.min(document.body.scrollHeight, 6000)) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          setTimeout(resolve, 350);
        }
      }, 260);
    })`,
    true
  );
}
function buildExtractionScript(): string {
  return `(() => {
    const selectors = [
      'article',
      '[data-testid="tweetText"]',
      '[data-testid="post-container"]',
      '[data-e2e="comment-item"]',
      '.comment',
      '.reply',
      '.review',
      '.content',
      '.post',
      'p'
    ];

    const platform = (() => {
      const host = location.hostname.toLowerCase();
      if (host.includes('steam')) return 'steam';
      if (host.includes('reddit')) return 'reddit';
      if (host.includes('bilibili')) return 'bilibili';
      if (host.includes('nga')) return 'nga';
      if (host.includes('taptap')) return 'taptap';
      if (host.includes('heybox')) return 'heybox';
      return 'import';
    })();

    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const isVisible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width >= 24 && rect.height >= 10 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
    };
    const looksLikeContent = (text) => {
      if (text.length < 12 || text.length > 1200) return false;
      if (/^(login|sign in|share|reply|like|follow|menu)$/i.test(text)) return false;
      const words = text.split(' ').filter(Boolean).length;
      return /[\\u3400-\\u9fff]/.test(text) || words >= 4;
    };

    const seen = new Set();
    const items = [];
    const nodes = Array.from(document.querySelectorAll(selectors.join(',')));

    for (const node of nodes) {
      if (!(node instanceof HTMLElement) || !isVisible(node)) continue;
      const body = clean(node.innerText || node.textContent);
      if (!looksLikeContent(body) || seen.has(body)) continue;
      seen.add(body);
      items.push({
        body,
        platform,
        sourceUrl: location.href,
        sourceTitle: document.title,
        selector: node.tagName.toLowerCase() + (node.className ? '.' + clean(node.className).replace(/ /g, '.') : '')
      });
      if (items.length >= 80) break;
    }

    return {
      url: location.href,
      title: document.title,
      platform,
      itemCount: items.length,
      items
    };
  })();`;
}
