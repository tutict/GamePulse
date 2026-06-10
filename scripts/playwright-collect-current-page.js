async (page) => {
const projectId = await page.evaluate(() => localStorage.getItem("gamepulse.projectId"));

if (!projectId) {
  throw new Error("Set localStorage gamepulse.projectId before collecting.");
}

const extracted = await page.evaluate(() => {
  const hostname = location.hostname;
  const platform = hostname.includes("taptap.cn")
    ? "taptap"
    : hostname.includes("bilibili.com")
      ? "bilibili"
      : hostname.includes("nga.cn") || hostname.includes("nga.178.com")
        ? "nga"
        : hostname.includes("xiaoheihe")
          ? "heybox"
          : hostname.includes("reddit.com")
            ? "reddit"
            : "import";
  const selectors = [
    'a[href*="/review/"]',
    'a[href*="/post/"]',
    'a[href*="/topic/"]',
    '[data-testid="comment"]',
    ".reply-content",
    ".comment-content",
    ".postcontent",
    ".content",
    "article"
  ];
  const nodes = Array.from(new Set(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)))));
  const seen = new Set();
  const items = [];

  for (const node of nodes) {
    const rect = node.getBoundingClientRect();

    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const body = (node.textContent || "").replace(/\s+/g, " ").trim();

    if (body.length < 40 || body.length > 2500) {
      continue;
    }

    const link = node.closest("a") || node.querySelector("a[href]");
    const sourceUrl = link instanceof HTMLAnchorElement ? link.href : location.href;
    const key = `${sourceUrl}:${body.slice(0, 100)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    items.push({
      platform,
      body,
      sourceUrl,
      sourceTitle: document.title,
      externalId: sourceUrl,
      metadata: {
        collector: "playwright-current-visible-page",
        pageUrl: location.href
      }
    });

    if (items.length >= 30) {
      break;
    }
  }

  return { items };
});

const response = await page.request.post("http://127.0.0.1:4317/api/ingest/batch", {
  data: { projectId, items: extracted.items }
});
const payload = await response.json();
const result = { status: response.status(), items: extracted.items.length, payload };

console.log(JSON.stringify(result, null, 2));
}
