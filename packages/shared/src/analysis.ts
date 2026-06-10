import type { AnalysisLabel, EntityAlias, IngestItem, MatchedEntity, Sentiment, Topic } from "./domain.js";
import { normalizeWhitespace } from "./privacy.js";

const positiveTerms = [
  "好玩",
  "爽",
  "优秀",
  "喜欢",
  "满意",
  "良心",
  "推荐",
  "舒服",
  "improved",
  "love",
  "great",
  "good",
  "fun"
];

const negativeTerms = [
  "垃圾",
  "失望",
  "差",
  "恶心",
  "难受",
  "崩",
  "卡",
  "骂",
  "退坑",
  "退款",
  "劝退",
  "broken",
  "bad",
  "hate",
  "worse",
  "unplayable"
];

const bugTerms = ["bug", "闪退", "崩溃", "报错", "卡死", "黑屏", "掉线", "无法登录", "穿模", "回档", "crash", "freeze", "error"];
const churnTerms = ["退坑", "弃坑", "卸载", "退款", "不玩了", "劝退", "run away", "quit", "refund", "uninstall"];

const topicTerms: Array<{ topic: Topic; terms: string[] }> = [
  { topic: "performance", terms: ["卡顿", "掉帧", "发热", "优化", "加载", "fps", "lag", "performance"] },
  { topic: "crash", terms: ["闪退", "崩溃", "黑屏", "卡死", "crash", "freeze"] },
  { topic: "balance", terms: ["平衡", "削弱", "超模", "强度", "数值", "balance", "nerf", "buff"] },
  { topic: "monetization", terms: ["氪", "抽卡", "付费", "礼包", "逼氪", "pay", "gacha", "monetization"] },
  { topic: "content", terms: ["长草", "内容", "活动", "副本", "玩法", "endgame", "content"] },
  { topic: "matchmaking", terms: ["匹配", "排位", "外挂", "队友", "matchmaking", "ranked"] },
  { topic: "story", terms: ["剧情", "文案", "演出", "story", "plot"] },
  { topic: "character", terms: ["角色", "皮肤", "建模", "配音", "character", "skin"] },
  { topic: "event", terms: ["版本", "更新", "活动", "赛季", "update", "event", "patch"] },
  { topic: "account", terms: ["登录", "账号", "封号", "充值不到账", "account", "login"] },
  { topic: "community", terms: ["社区", "节奏", "运营", "公告", "moderation", "community"] }
];

export function detectLanguage(text: string): "zh" | "en" | "mixed" {
  const zhCount = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) ?? []).length;

  if (zhCount > 0 && latinCount > 0) {
    return "mixed";
  }

  return zhCount > latinCount ? "zh" : "en";
}

export function extractEntities(text: string, aliases: EntityAlias[]): MatchedEntity[] {
  const normalized = normalizeWhitespace(text).toLowerCase();
  const matches: MatchedEntity[] = [];

  for (const entity of aliases) {
    const matchedAliases = [entity.canonical, ...entity.aliases].filter((alias) => {
      return alias.length > 0 && normalized.includes(alias.toLowerCase());
    });

    if (matchedAliases.length > 0) {
      matches.push({
        kind: entity.kind,
        canonical: entity.canonical,
        matchedAliases: Array.from(new Set(matchedAliases))
      });
    }
  }

  return matches;
}

export function classifyCommentHeuristic(item: Pick<IngestItem, "body">, aliases: EntityAlias[] = []): AnalysisLabel {
  const body = normalizeWhitespace(item.body);
  const lower = body.toLowerCase();
  const positiveHits = positiveTerms.filter((term) => lower.includes(term.toLowerCase())).length;
  const negativeHits = negativeTerms.filter((term) => lower.includes(term.toLowerCase())).length;
  const bugHits = bugTerms.filter((term) => lower.includes(term.toLowerCase())).length;
  const churnHits = churnTerms.filter((term) => lower.includes(term.toLowerCase())).length;
  const topic = detectTopic(lower);
  const isBug = bugHits > 0 || topic === "crash";
  const isChurnRisk = churnHits > 0;
  const sentiment = detectSentiment(positiveHits, negativeHits, isBug, isChurnRisk);
  const severity = detectSeverity(sentiment, isBug, isChurnRisk, negativeHits, bugHits);
  const intent = isBug
    ? "bug_report"
    : isChurnRisk
      ? "churn_signal"
      : sentiment === "positive"
        ? "praise"
        : sentiment === "negative"
          ? "complaint"
          : lower.includes("?") || lower.includes("？")
            ? "question"
            : lower.includes("建议") || lower.includes("希望") || lower.includes("should")
              ? "suggestion"
              : "other";

  return {
    commentId: "",
    sentiment,
    topic,
    intent,
    severity,
    isBug,
    isChurnRisk,
    entities: extractEntities(body, aliases),
    confidence: 0.66,
    rationale: buildRationale(sentiment, topic, isBug, isChurnRisk),
    model: "heuristic-v1"
  };
}

function detectSentiment(positiveHits: number, negativeHits: number, isBug: boolean, isChurnRisk: boolean): Sentiment {
  if (isBug || isChurnRisk || negativeHits > positiveHits) {
    return positiveHits > 0 ? "mixed" : "negative";
  }

  if (positiveHits > 0) {
    return "positive";
  }

  return "neutral";
}

function detectTopic(lower: string): Topic {
  for (const candidate of topicTerms) {
    if (candidate.terms.some((term) => lower.includes(term.toLowerCase()))) {
      return candidate.topic;
    }
  }

  return "other";
}

function detectSeverity(sentiment: Sentiment, isBug: boolean, isChurnRisk: boolean, negativeHits: number, bugHits: number): number {
  let severity = sentiment === "negative" ? 3 : sentiment === "mixed" ? 2 : 1;

  if (isBug) {
    severity += 1;
  }

  if (isChurnRisk) {
    severity += 1;
  }

  if (negativeHits + bugHits >= 3) {
    severity += 1;
  }

  return Math.min(5, severity);
}

function buildRationale(sentiment: Sentiment, topic: Topic, isBug: boolean, isChurnRisk: boolean): string {
  const parts = [`情绪=${sentiment}`, `主题=${topic}`];

  if (isBug) {
    parts.push("包含BUG信号");
  }

  if (isChurnRisk) {
    parts.push("包含流失信号");
  }

  return parts.join("；");
}

export function calculateRiskIndex(input: {
  total: number;
  negative: number;
  bug: number;
  churnRisk: number;
  averageSeverity: number;
}): number {
  if (input.total <= 0) {
    return 0;
  }

  const negativeRate = input.negative / input.total;
  const bugRate = input.bug / input.total;
  const churnRate = input.churnRisk / input.total;
  const severity = Math.max(0, Math.min(1, input.averageSeverity / 5));
  const score = negativeRate * 42 + bugRate * 24 + churnRate * 24 + severity * 10;

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function topicLabel(topic: Topic): string {
  const labels: Record<Topic, string> = {
    performance: "性能与优化",
    crash: "崩溃与闪退",
    balance: "数值平衡",
    monetization: "付费与商业化",
    content: "内容消耗",
    matchmaking: "匹配与竞技",
    story: "剧情与叙事",
    character: "角色与外观",
    event: "版本活动",
    account: "账号与登录",
    community: "社区与运营",
    other: "其他反馈"
  };

  return labels[topic];
}

