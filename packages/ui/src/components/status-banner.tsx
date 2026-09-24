import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../lib/utils.js";

type StatusTone = "error" | "warning" | "success" | "info";

const toneStyles: Record<StatusTone, { icon: typeof CircleAlert; className: string }> = {
  error: {
    icon: CircleAlert,
    className: "border-destructive/45 bg-destructive/10 text-foreground"
  },
  warning: {
    icon: TriangleAlert,
    className: "border-neutral/35 bg-neutral/10 text-foreground"
  },
  success: {
    icon: CircleCheck,
    className: "border-positive/35 bg-positive/10 text-foreground"
  },
  info: {
    icon: Info,
    className: "border-border bg-muted/40 text-foreground"
  }
};

export function StatusBanner(props: {
  tone: StatusTone;
  className?: string;
  children: ReactNode;
}) {
  const presentation = toneStyles[props.tone];
  const Icon = presentation.icon;
  const isError = props.tone === "error";

  return (
    <div
      aria-live={isError ? undefined : "polite"}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-md border p-4 text-sm leading-6",
        presentation.className,
        props.className
      )}
      role={isError ? "alert" : "status"}
    >
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", isError && "text-destructive")} />
      <p className="m-0 min-w-0 break-words">{props.children}</p>
    </div>
  );
}
