import { forwardRef, type ReactNode } from "react";
import { cn } from "../lib/utils.js";

export const PageHeading = forwardRef<HTMLHeadingElement, { className?: string; children: ReactNode }>(
  ({ className, children }, ref) => (
    <h2
      className={cn(
        "break-words text-2xl font-semibold leading-tight tracking-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:text-3xl",
        className
      )}
      ref={ref}
      tabIndex={-1}
    >
      {children}
    </h2>
  )
);

PageHeading.displayName = "PageHeading";
