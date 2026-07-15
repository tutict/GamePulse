import { BrowserWindow, net } from "electron";
import { selectSteamSearchItems } from "./liveResearchCollector.js";
import type {
  ResearchPageCapture,
  ResearchPageReader,
  ResearchSearchResult
} from "./liveResearchCollector.js";

const searchProviders = [
  (query: string) => `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-hans`,
  (query: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
];

export class ChromiumResearchPageReader implements ResearchPageReader {
  private readonly steamNames = new Map<string, string>();
  private readonly steamSearchResults = new Map<string, ResearchSearchResult[]>();

  async search(query: string, signal?: AbortSignal): Promise<ResearchSearchResult[]> {
    let lastError: unknown;
    const gameName = extractGameName(query);
    let steamResults = this.steamSearchResults.get(gameName) ?? [];
    try {
      if (steamResults.length === 0) {
        steamResults = await this.searchSteam(gameName, signal);
        this.steamSearchResults.set(gameName, steamResults);
      }
    } catch (error) {
      if (signal?.aborted || isAbortError(error)) {
        throw error;
      }
      lastError = error;
    }

    for (const provider of searchProviders) {
      throwIfAborted(signal);
      const window = createCollectorWindow();
      try {
        await loadUrlWithTimeout(window, provider(query), 20_000, signal);
        await delay(500, signal);
        const results = await window.webContents.executeJavaScript(
          searchExtractionScript(),
          true
        ) as ResearchSearchResult[];
        if (results.length > 0) {
          return [...steamResults, ...results].slice(0, 30);
        }
      } catch (error) {
        if (signal?.aborted || isAbortError(error)) {
          throw error;
        }
        lastError = error;
      } finally {
        closeWindow(window);
      }
    }
    if (steamResults.length > 0) {
      return steamResults;
    }
    if (lastError) {
      throw lastError;
    }
    return [];
  }

  async capture(url: string, signal?: AbortSignal): Promise<ResearchPageCapture> {
    const steamAppId = parseSteamAppId(url);
    if (steamAppId) {
      return this.captureSteamReviews(steamAppId, url, signal);
    }
    const window = createCollectorWindow();
    try {
      await loadUrlWithTimeout(window, url, 22_000, signal);
      await delay(800, signal);
      await autoScrollPage(window, signal);
      return await window.webContents.executeJavaScript(
        pageExtractionScript(),
        true
      ) as ResearchPageCapture;
    } finally {
      closeWindow(window);
    }
  }

  private async searchSteam(
    gameName: string,
    signal?: AbortSignal
  ): Promise<ResearchSearchResult[]> {
    throwIfAborted(signal);
    const response = await net.fetch(
      `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(gameName)}&l=english&cc=US`,
      { signal }
    );
    if (!response.ok) {
      throw new Error(`Steam 商店搜索失败 (${response.status})`);
    }
    const payload = await response.json() as {
      items?: Array<{ id?: number; name?: string }>;
    };
    const validItems = (payload.items ?? [])
      .filter((item): item is { id: number; name: string } =>
        Number.isInteger(item.id) && typeof item.name === "string"
      );
    return selectSteamSearchItems(validItems, gameName)
      .map((item) => {
        const appId = String(item.id);
        this.steamNames.set(appId, item.name);
        return {
          title: `${item.name} Steam player reviews`,
          url: `https://store.steampowered.com/app/${appId}/#app_reviews_hash`
        };
      });
  }

  private async captureSteamReviews(
    appId: string,
    sourceUrl: string,
    signal?: AbortSignal
  ): Promise<ResearchPageCapture> {
    throwIfAborted(signal);
    const parameters = new URLSearchParams({
      json: "1",
      filter: "recent",
      language: "all",
      day_range: "90",
      review_type: "all",
      purchase_type: "all",
      num_per_page: "100",
      cursor: "*"
    });
    const response = await net.fetch(
      `https://store.steampowered.com/appreviews/${appId}?${parameters}`,
      { signal }
    );
    if (!response.ok) {
      throw new Error(`Steam 玩家评测读取失败 (${response.status})`);
    }
    const payload = await response.json() as {
      success?: number;
      reviews?: Array<{
        review?: string;
        timestamp_created?: number;
        voted_up?: boolean;
      }>;
    };
    if (payload.success !== 1 || !Array.isArray(payload.reviews)) {
      throw new Error("Steam 玩家评测响应格式无效");
    }
    const gameName = this.steamNames.get(appId) ?? `Steam App ${appId}`;
    return {
      title: `${gameName} - Steam 最近玩家评测`,
      url: sourceUrl,
      platform: "steam",
      items: payload.reviews.flatMap((review) => {
        const body = typeof review.review === "string" ? review.review.trim() : "";
        if (!body) {
          return [];
        }
        return [{
          body,
          postedAt: typeof review.timestamp_created === "number"
            ? new Date(review.timestamp_created * 1000).toISOString()
            : undefined,
          sentiment: review.voted_up === true
            ? "positive" as const
            : review.voted_up === false
              ? "negative" as const
              : "neutral" as const
        }];
      })
    };
  }
}

function extractGameName(query: string): string {
  return query.match(/^"([^"]+)"/)?.[1]?.trim() || query.trim();
}

function parseSteamAppId(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl);
    if (url.hostname !== "store.steampowered.com") {
      return undefined;
    }
    return url.pathname.match(/^\/app\/(\d+)(?:\/|$)/)?.[1];
  } catch {
    return undefined;
  }
}

function createCollectorWindow(): BrowserWindow {
  const window = new BrowserWindow({
    show: false,
    width: 1366,
    height: 920,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: "gamepulse-research"
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false)
  );
  return window;
}

function loadUrlWithTimeout(
  window: BrowserWindow,
  url: string,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      window.webContents.removeListener("did-finish-load", onFinish);
      window.webContents.removeListener("did-fail-load", onFail);
      error ? reject(error) : resolve();
    };
    const onAbort = () => {
      window.webContents.stop();
      finish(new DOMException("Research cancelled", "AbortError"));
    };
    const onFinish = () => finish();
    const onFail = (
      _event: Electron.Event,
      errorCode: number,
      errorDescription: string,
      _validatedUrl: string,
      isMainFrame: boolean
    ) => {
      if (isMainFrame) {
        finish(new Error(`页面加载失败 (${errorCode})：${errorDescription}`));
      }
    };
    const timer = setTimeout(
      () => finish(new Error(`加载页面超时：${safeDisplayUrl(url)}`)),
      timeoutMs
    );

    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    window.webContents.once("did-finish-load", onFinish);
    window.webContents.on("did-fail-load", onFail);
    void window.loadURL(url).catch((error) =>
      finish(error instanceof Error ? error : new Error(String(error)))
    );
  });
}

async function autoScrollPage(window: BrowserWindow, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  await window.webContents.executeJavaScript(`new Promise((resolve) => {
    let distance = 0;
    const limit = Math.min(document.body?.scrollHeight || 0, 5000);
    const step = Math.max(400, Math.floor(window.innerHeight * 0.75));
    const timer = setInterval(() => {
      window.scrollBy(0, step);
      distance += step;
      if (distance >= limit) {
        clearInterval(timer);
        window.scrollTo(0, 0);
        setTimeout(resolve, 300);
      }
    }, 220);
  })`, true);
  throwIfAborted(signal);
}

function searchExtractionScript(): string {
  return `(() => {
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const anchors = Array.from(document.querySelectorAll('li.b_algo h2 a, article h2 a, .result__a, main a[href], a[href]'));
    const seen = new Set();
    const results = [];
    for (const anchor of anchors) {
      const title = clean(anchor.innerText || anchor.textContent);
      const url = anchor.href;
      if (!title || title.length < 3 || !/^https?:/i.test(url) || seen.has(url)) continue;
      seen.add(url);
      results.push({ title, url });
      if (results.length >= 40) break;
    }
    return results;
  })();`;
}

function pageExtractionScript(): string {
  return `(() => {
    const selectors = [
      '[data-testid="review"]', '[itemprop="review"]', '[data-testid="comment"]',
      '[data-e2e="comment-item"]', '.apphub_CardTextContent', '.review_box',
      '.comment', '.reply', '.review', 'article', '.post', 'main p'
    ];
    const clean = (value) => String(value || '').replace(/\\s+/g, ' ').trim();
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width >= 24 && rect.height >= 10 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
    };
    const platform = (() => {
      const host = location.hostname.toLowerCase();
      if (host.includes('steam')) return 'steam';
      if (host.includes('reddit')) return 'reddit';
      if (host.includes('bilibili')) return 'bilibili';
      if (host.includes('taptap')) return 'taptap';
      if (host.includes('tieba')) return 'tieba';
      if (host.includes('nga')) return 'nga';
      if (host.includes('heybox')) return 'heybox';
      return 'public-web';
    })();
    const seen = new Set();
    const items = [];
    const publishedAt =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      document.querySelector('[itemprop="datePublished"]')?.getAttribute('content') ||
      document.querySelector('time[datetime]')?.getAttribute('datetime') ||
      undefined;
    for (const node of document.querySelectorAll(selectors.join(','))) {
      if (!(node instanceof HTMLElement) || !visible(node)) continue;
      const body = clean(node.innerText || node.textContent);
      if (body.length < 18 || body.length > 2000 || seen.has(body)) continue;
      seen.add(body);
      const container = node.closest('article, li, [data-testid], .comment, .review, .post') || node;
      const time = container.querySelector('time[datetime]');
      items.push({ body, postedAt: time?.getAttribute('datetime') || undefined });
      if (items.length >= 80) break;
    }
    return { title: document.title, url: location.href, platform, publishedAt, items };
  })();`;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Research cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    if (signal?.aborted) {
      onAbort();
    } else {
      signal?.addEventListener("abort", onAbort, { once: true });
    }
  });
}

function closeWindow(window: BrowserWindow): void {
  if (!window.isDestroyed()) {
    window.destroy();
  }
}

function safeDisplayUrl(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "未知地址";
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Research cancelled", "AbortError");
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
