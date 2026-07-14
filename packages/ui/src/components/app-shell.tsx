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
  const navigationItems = props.navigation.map((item) => {
    const active = props.activeNavigationId === item.id;
    return (
      <button
        aria-label={`切换到${item.label}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-h-11 min-w-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold text-muted-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "hover:bg-accent hover:text-accent-foreground",
          active && "bg-accent text-accent-foreground"
        )}
        key={item.id}
        onClick={() => props.onNavigate(item.id)}
        type="button"
      >
        <span className="grid size-5 shrink-0 place-items-center">{item.icon}</span>
        <span className="truncate">{item.label}</span>
      </button>
    );
  });

  return (
    <div className="min-h-dvh bg-background text-foreground lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-card lg:flex">
        <div className="flex min-h-20 items-center gap-3 border-b border-border px-5 py-4">
          <div className="shrink-0">{props.brand}</div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">{props.title}</h1>
            {props.subtitle ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{props.subtitle}</p>
            ) : null}
          </div>
        </div>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-1 px-3 py-4">
          {navigationItems}
        </nav>
        {props.actions ? (
          <div className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
            {props.actions}
          </div>
        ) : null}
      </aside>

      <header className="sticky top-0 z-20 border-b border-border bg-primary text-primary-foreground lg:hidden">
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

      <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8 lg:px-10">
        {props.children}
      </main>

      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur lg:hidden"
      >
        <div
          className="mx-auto grid max-w-3xl gap-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(1, props.navigation.length)}, minmax(0, 1fr))` }}
        >
          {props.navigation.map((item) => (
            <button
              aria-label={`切换到${item.label}`}
              aria-current={props.activeNavigationId === item.id ? "page" : undefined}
              className={cn(
                "flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs font-semibold text-muted-foreground transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                props.activeNavigationId === item.id && "bg-accent text-accent-foreground"
              )}
              key={item.id}
              onClick={() => props.onNavigate(item.id)}
              type="button"
            >
              {item.icon}
              <span className="max-w-full text-center leading-4">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}