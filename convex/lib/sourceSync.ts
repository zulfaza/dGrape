import { v, type Infer } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import type { Recipe } from "./recipeDomain"

const syncOutcome = v.object({ runId: v.id("recipeRuns"), at: v.number() })

/**
 * One row for each collection that a recipe writes. A recipe run writes its
 * terminal outcome here. Records that people or agents write directly do not
 * change this row.
 */
export const sourceSyncFields = {
  workspaceId: v.id("workspaces"),
  collectionId: v.id("collections"),
  lastSuccess: v.optional(syncOutcome),
  lastFailure: v.optional(syncOutcome),
}

/**
 * Sync state of one source collection. It does not tell if the result is
 * empty: an empty result from a synced source is still "synced".
 * - never_synced: no recipe run wrote this collection.
 * - synced: the latest recipe run succeeded.
 * - stale: a recipe run failed after the last success. The data is older.
 * - failed: recipe runs failed and none succeeded.
 */
export const sourceFreshnessValidator = v.union(
  v.object({ kind: v.literal("never_synced") }),
  v.object({
    kind: v.literal("synced"),
    lastSuccessfulSyncAt: v.number(),
    runId: v.id("recipeRuns"),
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

export function sourceFreshness(
  sync: Doc<"sourceSyncs"> | null
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
  return {
    collectionId: collection._id,
    name: collection.name,
    freshness: sourceFreshness(sync),
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
  const sync = await ctx.db
    .query("sourceSyncs")
    .withIndex("by_collectionId", (q) => q.eq("collectionId", collection._id))
    .unique()
  if (!sync) {
    await ctx.db.insert("sourceSyncs", {
      workspaceId: run.workspaceId,
      collectionId: collection._id,
      ...(outcome === "success"
        ? { lastSuccess: value }
        : { lastFailure: value }),
    })
    return
  }
  const previous = outcome === "success" ? sync.lastSuccess : sync.lastFailure
  if (previous && previous.at > at) return
  await ctx.db.patch(
    sync._id,
    outcome === "success" ? { lastSuccess: value } : { lastFailure: value }
  )
}
