import {
  Ban,
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleHelp,
  LoaderCircle,
  XCircle
} from "lucide-react";
import { Button } from "../../components/button.js";
import type {
  IdentityCandidateView,
  ResearchStageId,
  ResearchStageView,
  SourceStatusView
} from "./types.js";

const stageSequence: Array<{ id: ResearchStageId; label: string }> = [
  { id: "identity", label: "确认目标游戏" },
  { id: "discovery", label: "整理研究来源" },
  { id: "collection", label: "读取评论讨论" },
  { id: "cleaning", label: "清洗有效证据" },
  { id: "report", label: "生成风评报告" }
];

export function ResearchProgress(props: {
  gameName: string;
  focus?: string;
  stage: ResearchStageView;
  sources: SourceStatusView[];
  canCancel: boolean;
  identityCandidates?: IdentityCandidateView[];
  error?: string;
  onCancel?: () => void;
  onChooseIdentity?: (candidateId: string) => void;
}) {
  const currentIndex = stageSequence.findIndex((item) => item.id === props.stage.id);
  const covered = props.sources.filter((source) => source.status === "covered").length;
  const failed = props.sources.filter((source) => source.status === "failed").length;

  return (
    <div className="mx-auto w-full max-w-4xl">
      <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold text-muted-foreground">风评研究进行中</p>
          <h2 className="mt-2 break-words text-2xl font-semibold leading-tight sm:text-3xl">
            {props.gameName}
          </h2>
          {props.focus ? (
            <p className="mb-0 mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              关注：{props.focus}
            </p>
          ) : null}
        </div>
        {props.canCancel ? (
          <Button className="h-11 shrink-0" onClick={props.onCancel} type="button" variant="outline">
            <XCircle aria-hidden="true" />
            取消研究
          </Button>
        ) : null}
      </header>

      <div className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-10">
        <section aria-labelledby="research-stage-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="m-0 text-base font-semibold" id="research-stage-heading">
              研究进度
            </h3>
            <span className="text-xs text-muted-foreground">
              {Math.max(1, currentIndex + 1)} / {stageSequence.length}
            </span>
          </div>
          <ol className="mt-4 border-y border-border">
            {stageSequence.map((item, index) => {
              const completed = index < currentIndex;
              const active = index === currentIndex;
              return (
                <li
                  aria-current={active ? "step" : undefined}
                  className="flex min-h-16 items-center gap-3 border-b border-border py-3 last:border-b-0"
                  key={item.id}
                >
                  <StageIcon
                    active={active}
                    completed={completed}
                    status={props.stage.status}
                  />
                  <div className="min-w-0 flex-1">
                    <strong className="block text-sm">{item.label}</strong>
                    {active ? (
                      <span className="mt-1 block text-sm leading-5 text-muted-foreground">
                        {props.stage.message}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {completed ? "完成" : active ? stageStatusLabel(props.stage.status) : "等待"}
                  </span>
                </li>
              );
            })}
          </ol>

          {props.stage.status === "needs_input" && props.identityCandidates?.length ? (
            <div className="mt-6 rounded-md border border-border bg-card p-4" role="group" aria-labelledby="identity-choice-heading">
              <div className="flex items-start gap-3">
                <CircleHelp aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                <div>
                  <h3 className="m-0 text-sm font-semibold" id="identity-choice-heading">
                    请选择要研究的具体游戏
                  </h3>
                  <div className="mt-3 grid gap-2">
                    {props.identityCandidates.map((candidate) => (
                      <Button
                        className="h-auto min-h-11 justify-start whitespace-normal px-3 py-2 text-left"
                        key={candidate.id}
                        onClick={() => props.onChooseIdentity?.(candidate.id)}
                        type="button"
                        variant="outline"
                      >
                        <span className="min-w-0">
                          <strong className="block break-words">{candidate.name}</strong>
                          {candidate.platform ? (
                            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                              {candidate.platform}
                            </span>
                          ) : null}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {props.error ? (
            <div className="mt-6 flex gap-3 rounded-md border border-destructive/35 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span className="leading-6">{props.error}</span>
            </div>
          ) : null}
        </section>

        <aside aria-labelledby="source-status-heading" className="lg:border-l lg:border-border lg:pl-6">
          <h3 className="m-0 text-base font-semibold" id="source-status-heading">
            来源覆盖
          </h3>
          <p className="mb-0 mt-2 text-sm text-muted-foreground">
            {covered} 个已覆盖 · {failed} 个失败 · {props.stage.evidenceCount} 条证据
          </p>
          {props.sources.length === 0 ? (
            <div className="mt-4 rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              正在发现可用来源。
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-border border-y border-border">
              {props.sources.map((source) => (
                <li className="flex gap-3 py-3" key={source.id}>
                  <SourceIcon status={source.status} />
                  <div className="min-w-0 flex-1">
                    <strong className="block break-words text-sm">{source.title}</strong>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {source.platform} · {source.itemCount} 条
                    </span>
                    {source.error ? (
                      <span className="mt-1 block break-words text-xs leading-5 text-destructive">
                        {source.error}
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function StageIcon(props: {
  active: boolean;
  completed: boolean;
  status: ResearchStageView["status"];
}) {
  if (props.completed) {
    return <CheckCircle2 aria-hidden="true" className="size-5 shrink-0 text-ring" />;
  }
  if (!props.active) {
    return <Circle aria-hidden="true" className="size-5 shrink-0 text-border" />;
  }
  if (props.status === "failed") {
    return <CircleAlert aria-hidden="true" className="size-5 shrink-0 text-destructive" />;
  }
  if (props.status === "cancelled") {
    return <Ban aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />;
  }
  if (props.status === "needs_input") {
    return <CircleHelp aria-hidden="true" className="size-5 shrink-0 text-ring" />;
  }
  return <LoaderCircle aria-hidden="true" className="size-5 shrink-0 animate-spin text-ring motion-reduce:animate-none" />;
}

function SourceIcon(props: { status: SourceStatusView["status"] }) {
  if (props.status === "covered") {
    return <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ring" />;
  }
  if (props.status === "failed") {
    return <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />;
  }
  return <Ban aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />;
}

function stageStatusLabel(status: ResearchStageView["status"]): string {
  return {
    running: "进行中",
    needs_input: "待确认",
    failed: "失败",
    cancelled: "已取消"
  }[status];
}