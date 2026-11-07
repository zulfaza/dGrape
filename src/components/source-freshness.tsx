import { Match } from "effect"
import type { SourceStatus } from "../../convex/lib/sourceSync"
import { Badge } from "./ui/badge"
import { formatDateTime } from "@/lib/format-time"

function Time({ at }: { at: number }) {
  return <time dateTime={new Date(at).toISOString()}>{formatDateTime(at)}</time>
}

/**
 * One source's recipe sync state. Stale, failed and never-synced sources look
 * different, so a page never shows old data as current. A synced source is
 * stale by age when its schedule missed a whole interval; the time is read at
 * render.
 */
export function SourceFreshness({ source }: { source: SourceStatus }) {
  const now = Date.now()
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span>{source.name}:</span>
      {Match.value(source.freshness).pipe(
        Match.discriminatorsExhaustive("kind")({
          never_synced: () => (
            <span className="text-sm text-muted-foreground">
              Not synced by a recipe
            </span>
          ),
          synced: (freshness) =>
            freshness.staleAfter !== null && now > freshness.staleAfter ? (
              <>
                <Badge variant="destructive">Stale</Badge>
                <span className="text-sm text-muted-foreground">
                  Data from <Time at={freshness.lastSuccessfulSyncAt} />. A
                  scheduled sync is late.
                </span>
              </>
            ) : (
              <>
                <Badge variant="secondary">Synced</Badge>
                <span className="text-sm text-muted-foreground">
                  <Time at={freshness.lastSuccessfulSyncAt} />
                </span>
              </>
            ),
          stale: (freshness) => (
            <>
              <Badge variant="destructive">Stale</Badge>
              <span className="text-sm text-muted-foreground">
                Data from <Time at={freshness.lastSuccessfulSyncAt} />. The sync
                failed at <Time at={freshness.lastFailedAt} />.
              </span>
            </>
          ),
          failed: (freshness) => (
            <>
              <Badge variant="destructive">Sync failed</Badge>
              <span className="text-sm text-muted-foreground">
                Never synced. Last failure at{" "}
                <Time at={freshness.lastFailedAt} />.
              </span>
            </>
          ),
        })
      )}
    </span>
  )
}
