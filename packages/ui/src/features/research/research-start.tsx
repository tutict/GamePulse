import { ArrowRight, CircleAlert, Clock3, FlaskConical, KeyRound, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Badge } from "../../components/badge.js";
import { Button } from "../../components/button.js";
import { Input } from "../../components/input.js";
import { Textarea } from "../../components/textarea.js";
import type { ResearchHistoryItem } from "./types.js";

export function ResearchStart(props: {
  recent: ResearchHistoryItem[];
  mode: "fixture" | "live";
  credentialsReady: boolean;
  busy?: boolean;
  error?: string;
  onStart?: (request: { gameName: string; focus?: string }) => void;
  onOpenResearch?: (researchId: string) => void;
}) {
  const [gameName, setGameName] = useState("");
  const [focus, setFocus] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = gameName.trim();
    if (!normalizedName) {
      return;
    }
    props.onStart?.({
      gameName: normalizedName,
      focus: focus.trim() || undefined
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl">
      <header className="border-b border-border pb-6 sm:pb-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">近 90 天优先</Badge>
          {props.mode === "fixture" ? (
            <Badge className="gap-1.5" variant="secondary">
              <FlaskConical aria-hidden="true" className="size-3.5" />
              固定验证样本
            </Badge>
          ) : (
            <Badge variant="secondary">公开来源研究</Badge>
          )}
        </div>
        <h2 className="mt-4 text-balance text-3xl font-semibold leading-tight tracking-normal sm:text-4xl">
          开始游戏风评研究
        </h2>
      </header>

      {props.error ? (
        <div className="mt-5 flex gap-3 rounded-md border border-destructive/35 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <span className="leading-6">{props.error}</span>
        </div>
      ) : null}
      <form className="grid gap-5 py-6 sm:py-8" onSubmit={handleSubmit}>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="research-game-name">
          游戏名称
          <Input
            autoComplete="off"
            autoFocus
            className="h-11 bg-card text-base"
            id="research-game-name"
            maxLength={120}
            onChange={(event) => setGameName(event.target.value)}
            placeholder="例如：幻兽帕鲁"
            required
            value={gameName}
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold" htmlFor="research-focus">
          重点关注的问题（可选）
          <Textarea
            className="min-h-28 resize-y bg-card text-base"
            id="research-focus"
            maxLength={500}
            onChange={(event) => setFocus(event.target.value)}
            placeholder="例如：最近更新后的联机稳定性"
            value={focus}
          />
        </label>
        <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm leading-6 text-muted-foreground">
            {props.mode === "fixture" ? (
              <span className="inline-flex items-center gap-2">
                <FlaskConical aria-hidden="true" className="size-4 shrink-0" />
                本轮只使用固定样本，不执行实时网络请求。
              </span>
            ) : props.credentialsReady ? (
              "研究服务已就绪"
            ) : (
              <span className="inline-flex items-center gap-2 text-destructive">
                <KeyRound aria-hidden="true" className="size-4 shrink-0" />
                远程模型尚未配置
              </span>
            )}
          </div>
          <Button
            className="h-11 w-full sm:w-auto"
            disabled={!gameName.trim() || props.busy}
            size="lg"
            type="submit"
          >
            {props.busy ? (
              <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            ) : (
              <ArrowRight aria-hidden="true" />
            )}
            {props.busy ? "正在开始" : "开始研究"}
          </Button>
        </div>
      </form>

      <section aria-labelledby="recent-research-heading" className="border-t border-border pt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="m-0 text-base font-semibold" id="recent-research-heading">
            最近研究
          </h3>
          <span className="text-xs text-muted-foreground">{props.recent.length} 项</span>
        </div>
        {props.recent.length === 0 ? (
          <div className="mt-4 rounded-md border border-dashed border-border bg-muted/40 px-5 py-8 text-center">
            <Clock3 aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
            <p className="mb-0 mt-3 text-sm text-muted-foreground">
              第一份报告会显示在这里。
            </p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-border border-y border-border">
            {props.recent.slice(0, 5).map((item) => (
              <button
                className="flex min-h-16 w-full items-center gap-4 px-1 py-3 text-left transition-colors hover:bg-accent/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                key={item.id}
                onClick={() => props.onOpenResearch?.(item.id)}
                type="button"
              >
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-sm">{item.gameName}</strong>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {item.verdict ?? statusLabel(item.status)}
                  </span>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  {item.reportVersion ? `v${item.reportVersion}` : statusLabel(item.status)}
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function statusLabel(status: ResearchHistoryItem["status"]): string {
  return {
    pending: "等待开始",
    running: "研究中",
    needs_input: "等待确认",
    completed: "已完成",
    failed: "未完成",
    cancelled: "已取消"
  }[status];
}
