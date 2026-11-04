import { v, type Infer } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Recipe } from "./recipeDomain"
import { nextOccurrence } from "./recipeSchedule"

const syncOutcome = v.object({ runId: v.id("recipeRuns"), at: v.number() })

/**
 * One row for each collection that a recipe writes. A recipe run writes its
 * terminal outcome here. Records that people or agents write directly do not
 * change this row.
 */
export const sourceSyncFields = {
  collectionId: v.id("collections"),
  lastSuccess: v.optional(syncOutcome),
  lastFailure: v.optional(syncOutcome),
  /** The schedule of the latest scheduled run that wrote this collection. */
  scheduleId: v.optional(v.id("recipeSchedules")),
}

/**
 * Sync state of one source collection. It does not tell if the result is
 * empty: an empty result from a synced source is still "synced".
 * - never_synced: no recipe run wrote this collection.
 * - synced: the latest recipe run succeeded. `staleAfter` is the time after
 *   which the data is stale by age: the schedule then missed a whole
 *   interval. It is null when no enabled cron schedule writes the
 *   collection. Queries cannot read the clock, so the reader compares it with
 *   the current time.
 * - stale: a recipe run failed after the last success. The data is older.
 * - failed: recipe runs failed and none succeeded.
 */
export const sourceFreshnessValidator = v.union(
  v.object({ kind: v.literal("never_synced") }),
  v.object({
    kind: v.literal("synced"),
    lastSuccessfulSyncAt: v.number(),
    runId: v.id("recipeRuns"),
    staleAfter: v.union(v.number(), v.null()),
  }),
  v.object({
    kind: v.literal("stale"),
    lastSuccessfulSyncAt: v.number(),
    lastFailedAt: v.number(),
    failedRunId: v.id("recipeRuns"),
  }),
  v.object({
    kind: v.literal("failed"),
    lastFailedAt: v.number(),
    failedRunId: v.id("recipeRuns"),
  })
)
export type SourceFreshness = Infer<typeof sourceFreshnessValidator>

export const sourceStatusValidator = v.object({
  collectionId: v.id("collections"),
  name: v.string(),
  freshness: sourceFreshnessValidator,
})
export type SourceStatus = Infer<typeof sourceStatusValidator>

/**
 * The second occurrence of the schedule after `syncedAt`. One late or
 * missed run is not stale yet; a missed whole interval is.
 */
function staleAfter(
  schedule: Doc<"recipeSchedules"> | null,
  syncedAt: number
): number | null {
  if (!schedule?.enabled || schedule.timing.kind !== "cron") return null
  const next = nextOccurrence(schedule.timing, syncedAt)
  return next === null ? null : nextOccurrence(schedule.timing, next)
}

export function sourceFreshness(
  sync: Doc<"sourceSyncs"> | null,
  schedule: Doc<"recipeSchedules"> | null
): SourceFreshness {
  const success = sync?.lastSuccess
  const failure = sync?.lastFailure
  if (failure && (!success || failure.at > success.at))
    return success
      ? {
          kind: "stale",
          lastSuccessfulSyncAt: success.at,
          lastFailedAt: failure.at,
          failedRunId: failure.runId,
        }
      : {
          kind: "failed",
          lastFailedAt: failure.at,
          failedRunId: failure.runId,
        }
  return success
    ? {
        kind: "synced",
        lastSuccessfulSyncAt: success.at,
        runId: success.runId,
        staleAfter: staleAfter(schedule, success.at),
      }
    : { kind: "never_synced" }
}

/** The time of the data that a result shows, or null when no sync succeeded. */
export function dataAsOf(freshness: SourceFreshness): number | null {
  return freshness.kind === "synced" || freshness.kind === "stale"
    ? freshness.lastSuccessfulSyncAt
    : null
}

export async function readSourceStatus(
  ctx: QueryCtx,
  collection: Doc<"collections">
): Promise<SourceStatus> {
  const sync = await ctx.db
    .query("sourceSyncs")
    .withIndex("by_collectionId", (q) => q.eq("collectionId", collection._id))
    .unique()
  const schedule = sync?.scheduleId ? await ctx.db.get(sync.scheduleId) : null
  return {
    collectionId: collection._id,
    name: collection.name,
    freshness: sourceFreshness(sync, schedule),
  }
}

/**
 * Record a terminal run outcome for the collection that the recipe writes.
 * Recipes without an upsert or snapshot output have no source to record.
 * An older outcome never replaces a newer one.
 */
export async function recordSyncOutcome(
  ctx: MutationCtx,
  run: Doc<"recipeRuns">,
  recipe: Recipe,
  outcome: "success" | "failure",
  at: number
): Promise<void> {
  const output = recipe.steps.at(-1)
  if (output?.kind !== "upsert" && output?.kind !== "snapshot") return
  const collectionId = ctx.db.normalizeId("collections", output.collectionId)
  const collection = collectionId ? await ctx.db.get(collectionId) : null
  if (!collection || collection.workspaceId !== run.workspaceId) return
  const value = { runId: run._id, at }
  const scheduled = run.scheduleId ? { scheduleId: run.scheduleId } : {}
  const sync = await ctx.db
    .query("sourceSyncs")
    .withIndex("by_collectionId", (q) => q.eq("collectionId", collection._id))
    .unique()
  if (!sync) {
    await ctx.db.insert("sourceSyncs", {
      collectionId: collection._id,
      ...scheduled,
      ...(outcome === "success"
        ? { lastSuccess: value }
        : { lastFailure: value }),
    })
    return
  }
  const previous = outcome === "success" ? sync.lastSuccess : sync.lastFailure
  if (previous && previous.at > at) return
  await ctx.db.patch(sync._id, {
    ...scheduled,
    ...(outcome === "success"
      ? { lastSuccess: value }
      : { lastFailure: value }),
  })
}
