// ==UserScript==
// @name         GamePulse 当前页采集器
// @namespace    https://github.com/tutict/GamePulse
// @version      0.1.0
// @description  将当前可见社区评论采集到本地 GamePulse API。不会读取或保存 cookies。
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

  const API_BASE = "http://localhost:4317";
  const PROJECT_KEY = "gamepulse.projectId";
  const platform = detectPlatform(location.hostname);

  if (!platform) {
    return;
  }

  const button = document.createElement("button");
  button.textContent = "采集到 GamePulse";
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

  button.addEventListener("click", async () => {
    const projectId = getProjectId();

    if (!projectId) {
      return;
    }

    const items = extractVisibleItems(platform);

    if (items.length === 0) {
      alert("GamePulse: 当前页没有识别到可采集评论。");
      return;
    }

    button.textContent = `提交 ${items.length} 条...`;
    button.disabled = true;

    try {
      const response = await fetch(`${API_BASE}/api/ingest/batch`, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ projectId, items })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const result = await response.json();
      button.textContent = `已新增 ${result.inserted}`;
      setTimeout(() => {
        button.textContent = "采集到 GamePulse";
        button.disabled = false;
      }, 1800);
    } catch (error) {
      console.error(error);
      alert(`GamePulse 提交失败：${error instanceof Error ? error.message : String(error)}`);
      button.textContent = "采集到 GamePulse";
      button.disabled = false;
    }
  });

  function getProjectId() {
    const current = localStorage.getItem(PROJECT_KEY);
    const next = prompt("GamePulse 项目 ID", current || "");

    if (!next) {
      return "";
    }

    localStorage.setItem(PROJECT_KEY, next.trim());
    return next.trim();
  }

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

    if (timeNode && timeNode.getAttribute("datetime")) {
      return timeNode.getAttribute("datetime");
    }

    return undefined;
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
})();

