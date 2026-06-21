import type { ComponentProps } from "react";

import { cn } from "#/lib/utils.ts";

type TimelineItemState = "complete" | "current" | "future" | "destructive";

function Timeline({ className, ...props }: ComponentProps<"ol">) {
  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ol
        aria-label="Timeline"
        className={cn("grid min-w-[30rem] grid-flow-col auto-cols-fr py-1", className)}
        {...props}
      />
    </div>
  );
}

function TimelineItem({
  children,
  className,
  state = "future",
  ...props
}: ComponentProps<"li"> & { state?: TimelineItemState }) {
  return (
    <li
      className={cn("group flex min-w-0 flex-col items-center text-center", className)}
      data-state={state}
      {...props}
    >
      <div
        className={cn(
          "mb-2 text-xs font-medium",
          state === "current"
            ? "text-foreground"
            : state === "destructive"
              ? "text-destructive"
              : "text-muted-foreground",
        )}
      >
        {children}
      </div>
      <div className="relative flex h-4 w-full items-center justify-center">
        <div
          aria-hidden
          className={cn(
            "absolute inset-x-0 h-1 bg-muted group-first:left-1/2 group-last:right-1/2",
            state === "complete" && "bg-primary/70",
            state === "current" &&
              "bg-[linear-gradient(to_right,color-mix(in_oklab,var(--primary)_70%,transparent)_0_50%,var(--muted)_50%_100%)]",
            state === "destructive" && "bg-destructive/70",
          )}
        />
        <div
          aria-hidden
          className={cn(
            "relative z-10 size-4 rounded-full border-2",
            state === "complete" && "border-primary bg-primary",
            state === "current" && "border-primary bg-background ring-4 ring-primary/15",
            state === "future" && "border-border bg-background",
            state === "destructive" &&
              "border-destructive bg-background ring-4 ring-destructive/15",
          )}
        />
      </div>
    </li>
  );
}

export { Timeline, TimelineItem };
