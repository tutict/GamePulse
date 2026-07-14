import { ArrowRight, Clock3, FileText, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "../../components/badge.js";
import { Button } from "../../components/button.js";
import type { ResearchHistoryItem } from "./types.js";

export function ResearchHistory(props: {
  items: ResearchHistoryItem[];
  onOpenResearch?: (researchId: string) => void;
  onStartResearch?: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="border-b border-border pb-6">
        <h2 className="m-0 text-2xl font-semibold sm:text-3xl">历史报告</h2>
        <p className="mb-0 mt-2 text-sm text-muted-foreground">{props.items.length} 项本地研究</p>
      </header>

      {props.items.length === 0 ? (
        <div className="py-14 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-md bg-secondary text-secondary-foreground">
            <FileText aria-hidden="true" className="size-5" />
          </div>
          <h3 className="mb-0 mt-4 text-lg font-semibold">还没有风评报告</h3>
          <Button className="mt-5 h-11" onClick={props.onStartResearch} type="button">
            开始一次游戏研究
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border border-b border-border">
          {props.items.map((item) => (
            <article className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center" key={item.id}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="m-0 break-words text-base font-semibold">{item.gameName}</h3>
                  {item.reportVersion ? <Badge variant="outline">v{item.reportVersion}</Badge> : null}
                  <Badge variant={item.status === "failed" ? "destructive" : "secondary"}>
                    {statusLabel(item.status)}
                  </Badge>
                </div>
                {item.focus ? (
                  <p className="mb-0 mt-2 truncate text-sm text-muted-foreground">关注：{item.focus}</p>
                ) : null}
                <p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {item.verdict ?? "该研究尚未生成报告。"}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 aria-hidden="true" className="size-3.5" />
                    {formatDateTime(item.updatedAt)}
                  </span>
                  {item.positiveRate !== undefined ? (
                    <span>正面样本 {item.positiveRate}%</span>
                  ) : null}
                  {item.historicalDelta !== undefined ? (
                    <span className="inline-flex items-center gap-1">
                      {item.historicalDelta >= 0 ? (
                        <TrendingUp aria-hidden="true" className="size-3.5" />
                      ) : (
                        <TrendingDown aria-hidden="true" className="size-3.5" />
                      )}
                      {item.historicalDelta > 0 ? "+" : ""}{item.historicalDelta} 个百分点
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                className="h-11 w-full sm:w-auto"
                disabled={!props.onOpenResearch}
                onClick={() => props.onOpenResearch?.(item.id)}
                type="button"
                variant="outline"
              >
                打开报告
                <ArrowRight aria-hidden="true" />
              </Button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function statusLabel(status: ResearchHistoryItem["status"]): string {
  return {
    pending: "等待开始",
    running: "研究中",
    needs_input: "待确认",
    completed: "已完成",
    failed: "未完成",
    cancelled: "已取消"
  }[status];
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}