import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { workspaceBudgets } from "./lib/budgets"

const DAY_MS = 24 * 60 * 60 * 1000
const WORKSPACE_PAGE = 100
/** Checkpoints can hold up to 500 KB of rows each. */
const CHECKPOINT_PAGE = 8

/**
 * Deletes finished runs older than each workspace's `runRetentionDays`
 * budget, and audit events older than AUDIT_RETENTION_DAYS. The daily cron
 * in convex/crons.ts starts it. Records and artifacts that runs wrote stay.
 */
export const pruneAll = internalMutation({
  args: { after: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { after }) => {
    const page = await ctx.db
      .query("workspaces")
      .withIndex("by_creation_time", (q) =>
        after === null ? q : q.gt("_creationTime", after)
      )
      .take(WORKSPACE_PAGE)
    for (const workspace of page) {
      await ctx.scheduler.runAfter(0, internal.runRetention.pruneWorkspace, {
        workspaceId: workspace._id,
      })
      await ctx.scheduler.runAfter(0, internal.auditEvents.pruneWorkspace, {
        workspaceId: workspace._id,
      })
    }
    const last = page.at(-1)
    if (page.length === WORKSPACE_PAGE && last)
      await ctx.scheduler.runAfter(0, internal.runRetention.pruneAll, {
        after: last._creationTime,
      })
    return null
  },
})

/**
 * Deletes part of the oldest expired run of a workspace, then schedules
 * itself again until no expired run is left. Only finished runs have
 * `finishedAt`, so pending and running runs are never deleted.
 */
export const pruneWorkspace = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, { workspaceId }) => {
    const { runRetentionDays } = await workspaceBudgets(ctx, workspaceId)
    const cutoff = Date.now() - runRetentionDays * DAY_MS
    const run = await ctx.db
      .query("recipeRuns")
      .withIndex("by_workspaceId_and_finishedAt", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .gte("finishedAt", 0)
          .lt("finishedAt", cutoff)
      )
      .first()
    if (!run) return null
    const checkpoints = await ctx.db
      .query("recipeCheckpoints")
      .withIndex("by_runId_and_step", (q) => q.eq("runId", run._id))
      .take(CHECKPOINT_PAGE)
    for (const checkpoint of checkpoints) await ctx.db.delete(checkpoint._id)
    if (checkpoints.length < CHECKPOINT_PAGE) {
      for await (const attempt of ctx.db
        .query("recipeStepAttempts")
        .withIndex("by_runId_and_step", (q) => q.eq("runId", run._id)))
        await ctx.db.delete(attempt._id)
      await ctx.db.delete(run._id)
    }
    await ctx.scheduler.runAfter(0, internal.runRetention.pruneWorkspace, {
      workspaceId,
    })
    return null
  },
})
