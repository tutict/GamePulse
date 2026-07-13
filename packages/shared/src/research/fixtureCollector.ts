import { ResearchIdentityAmbiguousError, type ResearchCollector } from "./contracts.js";
import type {
  ResearchEvidence,
  ResearchRequest,
  ResearchSource
} from "./types.js";

const fixtureBaseUrl = "https://fixtures.gamepulse.local";

export class FixtureResearchCollector implements ResearchCollector {
  async collect(
    request: ResearchRequest,
    signal?: AbortSignal
  ): Promise<{ sources: ResearchSource[]; evidence: ResearchEvidence[] }> {
    throwIfAborted(signal);
    if (request.gameName.includes("同名") && !request.identityId) {
      throw new ResearchIdentityAmbiguousError([
        {
          id: "same-name-pc",
          name: `${request.gameName}（PC / 主机）`,
          platform: "PC / Console",
          url: `${fixtureBaseUrl}/identity/same-name-pc`
        },
        {
          id: "same-name-mobile",
          name: `${request.gameName}（移动端）`,
          platform: "Android / iOS",
          url: `${fixtureBaseUrl}/identity/same-name-mobile`
        }
      ]);
    }

    const sources: ResearchSource[] = [
      fixtureSource("steam", "steam", `${request.gameName} - Steam 固定验证样本`, 2),
      fixtureSource("bilibili", "bilibili", `${request.gameName} - Bilibili 固定验证样本`, 2),
      fixtureSource("reddit", "reddit", `${request.gameName} - Reddit 固定验证样本`, 1),
      fixtureSource(
        "public-forum",
        "public-forum",
        `${request.gameName} - 公开论坛固定验证样本`,
        2
      ),
      {
        id: "fixture-media-failed",
        platform: "media",
        title: `${request.gameName} - 媒体来源固定失败样本`,
        url: `${fixtureBaseUrl}/media/unavailable`,
        status: "failed",
        itemCount: 0,
        error: "固定验证样本模拟来源访问失败，未执行实时网络请求。"
      }
    ];

    const evidence: ResearchEvidence[] = [
      fixtureEvidence({
        id: "fixture-steam-stability",
        sourceId: "fixture-steam",
        platform: "steam",
        sourceTitle: sources[0]!.title,
        body: "最近补丁后多人联机仍会偶发断线，长时间游玩时也能感到帧率波动。",
        sentiment: "negative",
        relevance: 0.96,
        postedAt: "2026-07-09T08:00:00.000Z"
      }),
      fixtureEvidence({
        id: "fixture-steam-core-play",
        sourceId: "fixture-steam",
        platform: "steam",
        sourceTitle: sources[0]!.title,
        body: "核心战斗和探索循环依然很有吸引力，和朋友合作建造时尤其容易投入很久。",
        sentiment: "positive",
        relevance: 0.94,
        postedAt: "2026-07-08T13:20:00.000Z"
      }),
      fixtureEvidence({
        id: "fixture-bilibili-cadence",
        sourceId: "fixture-bilibili",
        platform: "bilibili",
        sourceTitle: sources[1]!.title,
        body: "更新节奏比首发阶段稳定，但新内容消耗较快，后续路线图仍需要更明确。",
        sentiment: "neutral",
        relevance: 0.91,
        postedAt: "2026-07-07T04:30:00.000Z"
      }),
      fixtureEvidence({
        id: "fixture-bilibili-core-play",
        sourceId: "fixture-bilibili",
        platform: "bilibili",
        sourceTitle: sources[1]!.title,
        body: "建造自由度和角色搭配带来了持续的新鲜感，战斗系统也有足够的组合空间。",
        sentiment: "positive",
        relevance: 0.89,
        postedAt: "2026-07-06T11:10:00.000Z"
      }),
      fixtureEvidence({
        id: "fixture-reddit-stability",
        sourceId: "fixture-reddit",
        platform: "reddit",
        sourceTitle: sources[2]!.title,
        body: "Co-op sessions are fun, but disconnects and server lag still interrupt longer multiplayer runs.",
        sentiment: "negative",
        relevance: 0.88,
        postedAt: "2026-07-05T16:45:00.000Z"
      }),
      fixtureEvidence({
        id: "fixture-forum-cadence",
        sourceId: "fixture-public-forum",
        platform: "public-forum",
        sourceTitle: sources[3]!.title,
        body: "近期活动和更新让回流体验更完整，开发组对内容计划的说明也比之前清楚。",
        sentiment: "positive",
        relevance: 0.86,
        postedAt: "2026-07-04T09:15:00.000Z"
      }),
      fixtureEvidence({
        id: "fixture-forum-core-play",
        sourceId: "fixture-public-forum",
        platform: "public-forum",
        sourceTitle: sources[3]!.title,
        body: "探索、收集和建造的核心玩法仍然成立，不过中后期重复感会因玩家目标不同而变化。",
        sentiment: "neutral",
        relevance: 0.83,
        postedAt: "2026-07-03T02:00:00.000Z"
      })
    ];

    throwIfAborted(signal);
    return { sources, evidence };
  }
}

function fixtureSource(
  id: string,
  platform: string,
  title: string,
  itemCount: number
): ResearchSource {
  return {
    id: `fixture-${id}`,
    platform,
    title,
    url: `${fixtureBaseUrl}/${id}`,
    status: "covered",
    itemCount
  };
}

function fixtureEvidence(input: {
  id: string;
  sourceId: string;
  platform: string;
  sourceTitle: string;
  body: string;
  sentiment: ResearchEvidence["sentiment"];
  relevance: number;
  postedAt: string;
}): ResearchEvidence {
  return {
    ...input,
    sourceUrl: `${fixtureBaseUrl}/${input.sourceId.replace("fixture-", "")}`,
    excerpt: input.body,
    body: input.body
  };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Research cancelled", "AbortError");
  }
}