import { describe, expect, it } from "vitest";
import {
  LiveResearchCollector,
  selectSteamSearchItems,
  type ResearchPageReader
} from "./liveResearchCollector.js";

describe("LiveResearchCollector", () => {
  it("keeps the exact base game instead of similarly named add-ons", () => {
    expect(selectSteamSearchItems([
      { id: 1623730, name: "Palworld" },
      { id: 4031890, name: "Palworld: Palfarm" },
      { id: 2771110, name: "Palworld - Soundtrack" }
    ], "Palworld")).toEqual([{ id: 1623730, name: "Palworld" }]);
  });

  it("filters unrelated results, deduplicates evidence, and preserves source failures", async () => {
    const steamUrl = "https://store.steampowered.com/app/1";
    const reader: ResearchPageReader = {
      async search() {
        return [
          {
            title: "幻兽帕鲁 玩家评价",
            url: `https://www.bing.com/ck/a?u=a1${Buffer.from(steamUrl).toString("base64url")}`
          },
          { title: "幻兽帕鲁 Reddit discussion", url: "https://www.reddit.com/r/games/1" },
          { title: "另一个游戏的评价", url: "https://example.com/other" },
          { title: "幻兽帕鲁 内网", url: "http://127.0.0.1/private" },
          { title: "幻兽帕鲁 IPv6", url: "http://[::1]/private" },
          { title: "幻兽帕鲁 凭据地址", url: "https://user:secret@example.com/private" }
        ];
      },
      async capture(url) {
        if (url.includes("reddit")) {
          throw new Error("Access denied");
        }
        return {
          title: "幻兽帕鲁 玩家评价",
          url: `${url}?token=secret&utm_source=test`,
          platform: "steam",
          publishedAt: "2026-07-10",
          items: [
            { body: "联机很好玩，但最近补丁后偶尔会断线。", postedAt: "2026-07-12" },
            { body: "联机很好玩，但最近补丁后偶尔会断线。", postedAt: "2026-07-12" },
            { body: "战斗和探索都很有趣，和朋友合作非常值得推荐。" },
            { body: "登录 注册 首页 菜单" }
          ]
        };
      }
    };

    const result = await new LiveResearchCollector(
      reader,
      () => "2026-07-15T00:00:00.000Z"
    ).collect({ gameName: "幻兽帕鲁", focus: "联机", periodDays: 90 });

    expect(result.sources).toHaveLength(2);
    expect(result.sources.map((source) => source.status)).toEqual(["covered", "failed"]);
    expect(result.evidence).toHaveLength(2);
    expect(result.evidence.map((item) => item.sentiment)).toEqual(["neutral", "positive"]);
    expect(result.evidence.every((item) => item.sourceUrl.includes("steampowered"))).toBe(true);
    expect(result.sources[0]?.url).toBe(steamUrl);
    expect(result.evidence.every((item) => !item.sourceUrl.includes("secret"))).toBe(true);
    expect(result.evidence.every((item) => !item.dateEstimated)).toBe(true);
  });

  it("reports discovery failure without inventing evidence", async () => {
    const reader: ResearchPageReader = {
      async search() {
        throw new Error("Search unavailable");
      },
      async capture() {
        throw new Error("should not capture");
      }
    };

    const result = await new LiveResearchCollector(reader).collect({
      gameName: "未知游戏",
      periodDays: 90
    });

    expect(result.evidence).toEqual([]);
    expect(result.sources).toEqual([
      expect.objectContaining({ status: "failed", error: expect.stringContaining("Search unavailable") })
    ]);
  });

  it("stops before discovery when cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const reader: ResearchPageReader = {
      async search() {
        return [];
      },
      async capture() {
        throw new Error("should not capture");
      }
    };

    await expect(new LiveResearchCollector(reader).collect(
      { gameName: "幻兽帕鲁", periodDays: 90 },
      controller.signal
    )).rejects.toMatchObject({ name: "AbortError" });
  });
});
