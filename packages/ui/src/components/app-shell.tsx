import type { ReactNode } from "react";
import { cn } from "../lib/utils.js";

export interface AppShellNavigationItem {
  id: string;
  label: string;
  icon: ReactNode;
}

export function AppShell(props: {
  brand: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  navigation: AppShellNavigationItem[];
  activeNavigationId: string;
  onNavigate: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center gap-3 px-4 py-3">
          <div className="shrink-0">{props.brand}</div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{props.title}</h1>
            {props.subtitle ? (
              <p className="mt-0.5 truncate text-xs text-primary-foreground/60">{props.subtitle}</p>
            ) : null}
          </div>
          {props.actions ? <div className="shrink-0">{props.actions}</div> : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5">{props.children}</main>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-6 gap-1">
          {props.navigation.map((item) => (
            <button
              aria-current={props.activeNavigationId === item.id ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-[10px] font-semibold text-muted-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                props.activeNavigationId === item.id && "bg-accent text-accent-foreground"
              )}
              key={item.id}
              onClick={() => props.onNavigate(item.id)}
              type="button"
            >
              {item.icon}
              <span className="max-w-full truncate">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
