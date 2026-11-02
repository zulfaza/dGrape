import { Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"

import { Button } from "#/components/ui/button.tsx"

type NotFoundProps = {
  /** Where the primary action sends the user. Defaults to the dashboard. */
  homeHref?: string
  homeLabel?: string
}

export function NotFound({
  homeHref = "/dashboard/workspaces",
  homeLabel = "Back to workspaces",
}: NotFoundProps) {
  return (
    <main className="relative flex min-h-[60svh] flex-1 items-center justify-center overflow-hidden p-6">
      {/* faint grid backdrop to match the "OS" terminal aesthetic */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,var(--foreground)_1px,transparent_1px),linear-gradient(to_bottom,var(--foreground)_1px,transparent_1px)] [background-size:32px_32px]"
      />

      <div className="relative w-full max-w-md border border-border bg-card font-mono shadow-sm">
        <div className="space-y-5 p-6">
          <p className="text-6xl font-bold leading-none tracking-tighter tabular-nums text-primary">
            404
          </p>

          <p className="text-sm leading-relaxed text-muted-foreground">
            This page doesn&apos;t exist — it may have been moved, renamed, or
            never shipped.
          </p>

          <Button asChild className="w-full">
            <Link to={homeHref}>
              <ArrowLeft />
              {homeLabel}
            </Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
