import { Match } from "effect"
import type { SourceStatus } from "../../convex/lib/sourceSync"
import { Badge } from "./ui/badge"

function Time({ at }: { at: number }) {
  const iso = new Date(at).toISOString()
  return <time dateTime={iso}>{iso} (UTC)</time>
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
            <Badge variant="outline">Not synced by a recipe</Badge>
          ),
          synced: (freshness) =>
            freshness.staleAfter !== null && now > freshness.staleAfter ? (
              <>
                <Badge variant="destructive">Stale</Badge>
                <span>
                  Data from <Time at={freshness.lastSuccessfulSyncAt} />. Stale
                  since <Time at={freshness.staleAfter} />
                </span>
              </>
            ) : (
              <>
                <Badge variant="secondary">Synced</Badge>
                <Time at={freshness.lastSuccessfulSyncAt} />
              </>
            ),
          stale: (freshness) => (
            <>
              <Badge variant="destructive">Stale</Badge>
              <span>
                Data from <Time at={freshness.lastSuccessfulSyncAt} />. Sync
                failed at <Time at={freshness.lastFailedAt} />
              </span>
            </>
          ),
          failed: (freshness) => (
            <>
              <Badge variant="destructive">Sync failed</Badge>
              <span>
                No successful sync. Last failure at{" "}
                <Time at={freshness.lastFailedAt} />
              </span>
            </>
          ),
        })
      )}
    </span>
  )
}
