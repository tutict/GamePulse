// ==UserScript==
// @name         GamePulse 当前页评论导出器
// @namespace    https://github.com/tutict/GamePulse
// @version      0.2.0
// @description  将当前页面可见评论下载为 GamePulse 可导入的 NDJSON 文件，不访问本地服务。
// @author       GamePulse
// @match        https://www.bilibili.com/*
// @match        https://*.bilibili.com/*
// @match        https://steamcommunity.com/*
// @match        https://store.steampowered.com/*
// @match        https://bbs.nga.cn/*
// @match        https://nga.178.com/*
// @match        https://www.reddit.com/*
// @match        https://*.reddit.com/*
// @match        https://www.taptap.cn/*
// @match        https://*.taptap.cn/*
// @match        https://api.xiaoheihe.cn/*
// @match        https://www.xiaoheihe.cn/*
// @grant        none
// ==/UserScript==

(function gamePulseCollector() {
  "use strict";

  const platform = detectPlatform(location.hostname);

  if (!platform) {
    return;
  }

  const button = document.createElement("button");
  button.textContent = "下载 GamePulse NDJSON";
  button.type = "button";
  button.style.position = "fixed";
  button.style.right = "18px";
  button.style.bottom = "18px";
  button.style.zIndex = "2147483647";
  button.style.border = "1px solid #43d69a";
  button.style.borderRadius = "8px";
  button.style.padding = "10px 13px";
  button.style.color = "#ecfff5";
  button.style.background = "#102018";
  button.style.font = "14px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  button.style.cursor = "pointer";
  button.style.boxShadow = "0 10px 30px rgba(0,0,0,.28)";
  document.body.appendChild(button);

  button.addEventListener("click", () => {
    const items = extractVisibleItems(platform);

    if (items.length === 0) {
      alert("GamePulse：当前页面没有识别到可导出的评论。");
      return;
    }

    const ndjson = `${items.map((item) => JSON.stringify(item)).join("\n")}\n`;
    const fileName = `gamepulse-${platform}-${fileTimestamp(new Date())}.ndjson`;
    downloadText(fileName, ndjson);
    button.textContent = `已下载 ${items.length} 条`;
    button.disabled = true;
    setTimeout(() => {
      button.textContent = "下载 GamePulse NDJSON";
      button.disabled = false;
    }, 1800);
  });

  function detectPlatform(hostname) {
    if (hostname.includes("bilibili.com")) return "bilibili";
    if (hostname.includes("steamcommunity.com") || hostname.includes("steampowered.com")) return "steam";
    if (hostname.includes("nga.cn") || hostname.includes("nga.178.com")) return "nga";
    if (hostname.includes("reddit.com")) return "reddit";
    if (hostname.includes("taptap.cn")) return "taptap";
    if (hostname.includes("xiaoheihe.cn") || hostname.includes("xiaoheihe")) return "heybox";
    return undefined;
  }

  function extractVisibleItems(currentPlatform) {
    const selectors = selectorsFor(currentPlatform);
    const nodes = uniqueNodes(selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector))));
    const title = textOf(document.querySelector("h1")) || document.title;
    const collectedAt = new Date().toISOString();
    const items = nodes
      .map((node, index) => {
        const body = textOf(node);

        if (!isUseful(body)) {
          return undefined;
        }

        return {
          platform: currentPlatform,
          body,
          sourceUrl: location.href,
          sourceTitle: title,
          externalId: `${location.href}#visible-${index}`,
          postedAt: extractTimeNear(node),
          metadata: {
            collectedAt,
            collector: "gamepulse-userscript",
            selectorHint: node.className ? String(node.className).slice(0, 120) : node.tagName
          }
        };
      })
      .filter(Boolean);

    return dedupeItems(items).slice(0, 500);
  }

  function selectorsFor(currentPlatform) {
    const common = [
      "[data-testid='comment']",
      ".comment",
      ".reply",
      ".review",
      "article",
      "blockquote",
      "p"
    ];

    const specific = {
      bilibili: [".reply-content", ".reply-item", ".comment-content", ".text"],
      steam: [".apphub_CardTextContent", ".commentthread_comment_text", ".review_box_content"],
      nga: [".postcontent", ".post_content", ".nga_post_content"],
      reddit: ["[data-testid='comment']", "shreddit-comment", "article"],
      taptap: [".comment-item", ".review-item", ".content", ".desc"],
      heybox: [".comment", ".reply", ".content", ".text"]
    };

    return [...(specific[currentPlatform] || []), ...common];
  }

  function uniqueNodes(nodes) {
    return Array.from(new Set(nodes)).filter((node) => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  }

  function textOf(node) {
    return (node && node.textContent ? node.textContent : "").replace(/\s+/g, " ").trim();
  }

  function isUseful(value) {
    if (!value || value.length < 8 || value.length > 3000) {
      return false;
    }

    const banned = ["登录", "注册", "隐私政策", "cookie", "广告"];
    return !banned.some((term) => value.toLowerCase() === term.toLowerCase());
  }

  function extractTimeNear(node) {
    const timeNode = node.querySelector("time") || node.closest("article")?.querySelector("time");
    return timeNode?.getAttribute("datetime") || undefined;
  }

  function dedupeItems(items) {
    const seen = new Set();
    const result = [];

    for (const item of items) {
      const key = item.body.slice(0, 200);

      if (!seen.has(key)) {
        seen.add(key);
        result.push(item);
      }
    }

    return result;
  }

  function downloadText(fileName, content) {
    const blob = new Blob([content], { type: "application/x-ndjson;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function fileTimestamp(value) {
    return value.toISOString().replace(/[:.]/g, "-");
  }
})();
