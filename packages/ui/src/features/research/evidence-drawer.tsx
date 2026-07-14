import { ExternalLink, FlaskConical, ShieldX, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { Badge } from "../../components/badge.js";
import { Button } from "../../components/button.js";
import { Textarea } from "../../components/textarea.js";
import type { EvidenceView } from "./types.js";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function EvidenceDrawer(props: {
  open: boolean;
  evidence: EvidenceView[];
  onClose: () => void;
  onExcludeEvidence?: (evidenceId: string, reason: string) => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [excludingId, setExcludingId] = useState<string>();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!props.open) {
      setExcludingId(undefined);
      setReason("");
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [props.open]);

  if (!props.open) {
    return null;
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      props.onClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusable = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleBackdrop(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      props.onClose();
    }
  }

  function submitExclusion(evidenceId: string) {
    const normalizedReason = reason.trim();
    if (!normalizedReason) {
      return;
    }
    props.onExcludeEvidence?.(evidenceId, normalizedReason);
    setExcludingId(undefined);
    setReason("");
  }

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-primary/35"
      onKeyDown={handleKeyDown}
      onMouseDown={handleBackdrop}
    >
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="flex h-full w-full max-w-2xl flex-col bg-background shadow-xl"
        ref={panelRef}
        role="dialog"
      >
        <header className="flex min-h-20 items-center gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 text-lg font-semibold" id={titleId}>
              来源与证据
            </h2>
            <p className="mb-0 mt-1 text-sm text-muted-foreground">
              {props.evidence.length} 条证据 · 排除后会生成新的报告版本
            </p>
          </div>
          <Button
            aria-label="关闭来源与证据"
            className="size-11"
            onClick={props.onClose}
            ref={closeRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-2 sm:px-6">
          {props.evidence.length === 0 ? (
            <div className="my-6 rounded-md border border-dashed border-border bg-muted/40 p-6 text-center text-sm text-muted-foreground">
              当前报告没有可检查的证据。
            </div>
          ) : (
            <div className="divide-y divide-border">
              {props.evidence.map((item) => (
                <article className="py-5" key={item.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.citationLabel}</Badge>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {item.platform}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        aria-hidden="true"
                        className={sentimentDotClass(item.sentiment)}
                      />
                      {sentimentLabel(item.sentiment)}
                    </span>
                    {item.fixture ? (
                      <Badge className="gap-1" variant="secondary">
                        <FlaskConical aria-hidden="true" className="size-3" />
                        固定样本
                      </Badge>
                    ) : null}
                  </div>
                  <h3 className="mb-0 mt-3 break-words text-sm font-semibold leading-6">
                    {item.sourceTitle}
                  </h3>
                  <blockquote className="mx-0 mb-0 mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">
                    {item.body}
                  </blockquote>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                    <time dateTime={item.postedAt}>{formatDate(item.postedAt)}</time>
                    {!item.fixture ? (
                      <a
                        className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-foreground underline decoration-border underline-offset-4 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        href={item.sourceUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        打开原始来源
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                      </a>
                    ) : null}
                  </div>

                  {!item.excluded && props.onExcludeEvidence ? (
                    excludingId === item.id ? (
                      <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 p-4">
                        <label className="grid gap-2 text-sm font-semibold" htmlFor={`exclude-${item.id}`}>
                          排除原因
                          <Textarea
                            autoFocus
                            className="min-h-20 bg-background text-base"
                            id={`exclude-${item.id}`}
                            maxLength={300}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="说明这条证据为什么不应参与报告"
                            value={reason}
                          />
                        </label>
                        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                          <Button
                            className="h-11"
                            onClick={() => {
                              setExcludingId(undefined);
                              setReason("");
                            }}
                            type="button"
                            variant="ghost"
                          >
                            取消
                          </Button>
                          <Button
                            className="h-11"
                            disabled={!reason.trim()}
                            onClick={() => submitExclusion(item.id)}
                            type="button"
                            variant="destructive"
                          >
                            <ShieldX aria-hidden="true" />
                            排除并重新生成
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        aria-label={`排除证据 ${item.citationLabel}`}
                        className="mt-4 h-11"
                        onClick={() => {
                          setExcludingId(item.id);
                          setReason("");
                        }}
                        type="button"
                        variant="outline"
                      >
                        <ShieldX aria-hidden="true" />
                        排除这条证据
                      </Button>
                    )
                  ) : item.excluded ? (
                    <p className="mb-0 mt-4 text-sm font-semibold text-destructive">
                      已排除，不参与当前报告。
                    </p>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function sentimentLabel(sentiment: EvidenceView["sentiment"]): string {
  return {
    positive: "正面",
    neutral: "中性",
    negative: "负面"
  }[sentiment];
}

function sentimentDotClass(sentiment: EvidenceView["sentiment"]): string {
  return {
    positive: "size-2 rounded-full bg-emerald-600",
    neutral: "size-2 rounded-full bg-amber-500",
    negative: "size-2 rounded-full bg-destructive"
  }[sentiment];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}