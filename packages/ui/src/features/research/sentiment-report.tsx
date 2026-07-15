import {
  ArrowDown,
  ArrowUp,
  Check,
  FlaskConical,
  Library,
  LoaderCircle,
  MessageSquareText,
  Minus,
  RefreshCw,
  Scale,
  Send,
  TriangleAlert
} from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Badge } from "../../components/badge.js";
import { Button } from "../../components/button.js";
import { Textarea } from "../../components/textarea.js";
import { EvidenceDrawer } from "./evidence-drawer.js";
import type {
  EvidenceView,
  ResearchSentimentView,
  SentimentReportView
} from "./types.js";

export function SentimentReport(props: {
  report: SentimentReportView;
  evidence: EvidenceView[];
  followUpAnswer?: string;
  followUpBusy?: boolean;
  busy?: boolean;
  onUpdateResearch?: () => void;
  onAskFollowUp?: (question: string) => void;
  onExcludeEvidence?: (evidenceId: string, reason: string) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const evidenceTriggerRef = useRef<HTMLButtonElement>(null);
  const citationLabels = new Map(
    props.evidence.map((item) => [item.id, item.citationLabel])
  );

  function closeDrawer() {
    setDrawerOpen(false);
    queueMicrotask(() => evidenceTriggerRef.current?.focus());
  }

  function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = question.trim();
    if (normalized) {
      props.onAskFollowUp?.(normalized);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">报告 v{props.report.version}</Badge>
            {props.evidence.some((item) => item.fixture) ? (
              <Badge className="gap-1.5" variant="secondary">
                <FlaskConical aria-hidden="true" className="size-3.5" />
                固定验证样本
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-3 break-words text-2xl font-semibold leading-tight sm:text-3xl">
            {props.report.gameName}
          </h2>
          <p className="mb-0 mt-2 text-sm text-muted-foreground">
            {formatDateTime(props.report.updatedAt)}
            {props.report.focus ? ` · 关注：${props.report.focus}` : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {props.onUpdateResearch ? (
            <Button className="h-11" disabled={props.busy} onClick={props.onUpdateResearch} type="button" variant="outline">
              <RefreshCw aria-hidden="true" />
              更新研究
            </Button>
          ) : null}
          <Button
            aria-controls="research-evidence-drawer"
            aria-expanded={drawerOpen}
            className="h-11"
            onClick={() => setDrawerOpen(true)}
            ref={evidenceTriggerRef}
            type="button"
          >
            <Library aria-hidden="true" />
            查看来源与证据
          </Button>
        </div>
      </header>

      <section className="-mx-4 bg-primary px-4 py-6 text-primary-foreground sm:mx-0 sm:mt-6 sm:rounded-lg sm:px-6" aria-labelledby="report-verdict-heading">
        <p className="m-0 text-sm font-semibold text-primary-foreground/70">总体判断</p>
        <h3 className="mb-0 mt-2 max-w-4xl text-balance text-xl font-semibold leading-8 sm:text-2xl" id="report-verdict-heading">
          {props.report.verdict}
        </h3>
        <p className="mb-0 mt-3 max-w-3xl text-pretty text-sm leading-6 text-primary-foreground/80">
          {props.report.summary}
        </p>
      </section>

      <section aria-labelledby="sentiment-overview-heading" className="border-b border-border py-7">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="m-0 text-lg font-semibold" id="sentiment-overview-heading">
              样本口碑概览
            </h3>
            <p className="mb-0 mt-1 text-sm text-muted-foreground">
              {props.report.coverage.evidenceCount} 条有效证据
            </p>
          </div>
          {props.report.historicalDelta !== undefined ? (
            <Delta value={props.report.historicalDelta} />
          ) : null}
        </div>

        <div
          aria-label={`正面 ${props.report.positiveRate}%，中性 ${props.report.neutralRate}%，负面 ${props.report.negativeRate}%`}
          className="mt-5 flex h-2 overflow-hidden rounded-full bg-muted"
          role="img"
        >
          <span className="bg-emerald-600" style={{ width: `${props.report.positiveRate}%` }} />
          <span className="bg-amber-500" style={{ width: `${props.report.neutralRate}%` }} />
          <span className="bg-destructive" style={{ width: `${props.report.negativeRate}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-3 divide-x divide-border border-y border-border">
          <Metric label="正面" value={props.report.positiveRate} tone="positive" />
          <Metric label="中性" value={props.report.neutralRate} tone="neutral" />
          <Metric label="负面" value={props.report.negativeRate} tone="negative" />
        </div>
      </section>

      <section aria-labelledby="topics-heading" className="border-b border-border py-7">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="m-0 text-lg font-semibold" id="topics-heading">
            主要关注主题
          </h3>
          <span className="text-xs text-muted-foreground">按证据相关性排序</span>
        </div>
        {props.report.topics.length === 0 ? (
          <p className="mb-0 mt-4 text-sm text-muted-foreground">当前证据不足以归纳稳定主题。</p>
        ) : (
          <ol className="mt-4 border-y border-border">
            {props.report.topics.map((topic, index) => (
              <li className="grid gap-3 border-b border-border py-5 last:border-b-0 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]" key={topic.id}>
                <span className="font-mono text-sm font-semibold text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="m-0 break-words text-base font-semibold">{topic.label}</h4>
                    <SentimentBadge sentiment={topic.sentiment} />
                  </div>
                  <p className="mb-0 mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                    {topic.summary}
                  </p>
                </div>
                <span className="text-xs font-semibold text-muted-foreground sm:pt-1">
                  {topic.evidenceIds
                    .map((id) => citationLabels.get(id))
                    .filter((label): label is string => Boolean(label))
                    .slice(0, 4)
                    .map((label) => `[${label}]`)
                    .join(" ")}
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="grid border-b border-border lg:grid-cols-3 lg:divide-x lg:divide-border">
        <FindingSection icon={<Check aria-hidden="true" />} items={props.report.strengths} title="核心优点" />
        <FindingSection icon={<TriangleAlert aria-hidden="true" />} items={props.report.risks} title="核心问题" />
        <FindingSection icon={<Scale aria-hidden="true" />} items={props.report.controversies} title="主要争议" />
      </div>

      <section className="grid gap-6 border-b border-border py-7 lg:grid-cols-[minmax(0,1fr)_18rem]" aria-labelledby="coverage-heading">
        <div>
          <h3 className="m-0 text-lg font-semibold" id="coverage-heading">
            研究覆盖
          </h3>
          <p className="mb-0 mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            本报告描述本次收集到的非随机公开样本，不代表全部玩家。失败或排除的来源不会参与结论。
          </p>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-3 lg:grid-cols-1">
          <CoverageMetric label="已覆盖" value={props.report.coverage.coveredSources} />
          <CoverageMetric label="失败" value={props.report.coverage.failedSources} />
          <CoverageMetric label="已排除" value={props.report.coverage.excludedSources} />
        </dl>
      </section>

      <section aria-labelledby="follow-up-heading" className="py-7">
        <div className="flex items-center gap-3">
          <MessageSquareText aria-hidden="true" className="size-5 text-muted-foreground" />
          <h3 className="m-0 text-lg font-semibold" id="follow-up-heading">
            基于当前证据追问
          </h3>
        </div>
        <form className="mt-4 grid gap-3" onSubmit={handleQuestion}>
          <label className="sr-only" htmlFor="research-follow-up-question">
            追问内容
          </label>
          <Textarea
            className="min-h-24 bg-card text-base"
            id="research-follow-up-question"
            maxLength={1000}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="例如：联机问题主要集中在哪些场景？"
            value={question}
          />
          <div className="flex justify-end">
            <Button className="h-11 w-full sm:w-auto" disabled={!question.trim() || props.followUpBusy} type="submit">
              {props.followUpBusy ? (
                <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              ) : (
                <Send aria-hidden="true" />
              )}
              基于证据回答
            </Button>
          </div>
        </form>
        {props.followUpAnswer ? (
          <div className="mt-5 rounded-md border border-border bg-card p-5" aria-live="polite">
            <p className="m-0 whitespace-pre-wrap text-sm leading-7">{props.followUpAnswer}</p>
          </div>
        ) : null}
      </section>

      <div id="research-evidence-drawer">
        <EvidenceDrawer
          evidence={props.evidence}
          onClose={closeDrawer}
          onExcludeEvidence={props.onExcludeEvidence}
          open={drawerOpen}
        />
      </div>
    </div>
  );
}

function Metric(props: {
  label: string;
  value: number;
  tone: "positive" | "neutral" | "negative";
}) {
  const toneClass = {
    positive: "text-emerald-700",
    neutral: "text-amber-700",
    negative: "text-destructive"
  }[props.tone];
  return (
    <div className="min-w-0 px-2 py-4 text-center sm:px-4">
      <span className="block text-xs font-semibold text-muted-foreground">{props.label}</span>
      <strong className={`mt-1 block text-xl sm:text-2xl ${toneClass}`}>{props.value}%</strong>
    </div>
  );
}

function Delta(props: { value: number }) {
  const improving = props.value > 0;
  const declining = props.value < 0;
  const Icon = improving ? ArrowUp : declining ? ArrowDown : Minus;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
      <Icon aria-hidden="true" className="size-4" />
      相比上一版 {props.value > 0 ? "+" : ""}{props.value} 个百分点
    </span>
  );
}

function SentimentBadge(props: { sentiment: ResearchSentimentView }) {
  const labels: Record<ResearchSentimentView, string> = {
    positive: "偏正面",
    neutral: "中性",
    negative: "偏负面",
    mixed: "有分歧"
  };
  return <Badge variant={props.sentiment === "negative" ? "destructive" : "secondary"}>{labels[props.sentiment]}</Badge>;
}

function FindingSection(props: { title: string; items: string[]; icon: ReactNode }) {
  return (
    <section className="border-b border-border py-6 last:border-b-0 lg:border-b-0 lg:px-6 lg:first:pl-0 lg:last:pr-0">
      <h3 className="m-0 flex items-center gap-2 text-base font-semibold">
        <span className="text-muted-foreground [&_svg]:size-4">{props.icon}</span>
        {props.title}
      </h3>
      {props.items.length === 0 ? (
        <p className="mb-0 mt-3 text-sm text-muted-foreground">当前样本中暂无明确结论。</p>
      ) : (
        <ul className="mb-0 mt-3 grid gap-3 pl-5 text-sm leading-6">
          {props.items.map((item) => (
            <li className="pl-1" key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CoverageMetric(props: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-xs font-semibold text-muted-foreground">{props.label}</dt>
      <dd className="m-0 mt-1 text-xl font-semibold">{props.value}</dd>
    </div>
  );
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
