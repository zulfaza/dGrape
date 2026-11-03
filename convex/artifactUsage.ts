import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { startArtifactUsage, usageRow } from "./lib/artifactUsage"

const SCAN_PAGE = 500
const START_PAGE = 100

/**
 * Adds one page of a workspace's artifacts after `after` to its usage, then
 * schedules the next page. A step whose `after` no longer matches the stored
 * state is a duplicate and does nothing. See convex/lib/artifactUsage.ts.
 */
export const scan = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    after: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, after }) => {
    const row = await usageRow(ctx, workspaceId)
    const usage = row?.artifacts
    if (!row || !usage || usage.kind !== "counting" || usage.after !== after)
      return null
    const page = await ctx.db
      .query("artifacts")
      .withIndex("by_workspaceId", (q) =>
        after === null
          ? q.eq("workspaceId", workspaceId)
          : q.eq("workspaceId", workspaceId).gt("_creationTime", after)
      )
      .take(SCAN_PAGE)
    const bytes = usage.bytes + page.reduce((sum, a) => sum + a.size, 0)
    const count = usage.count + page.length
    const last = page.at(-1)
    if (page.length < SCAN_PAGE || !last) {
      await ctx.db.patch(row._id, {
        artifacts: { kind: "counted", bytes, count },
      })
      return null
    }
    await ctx.db.patch(row._id, {
      artifacts: { kind: "counting", after: last._creationTime, bytes, count },
    })
    await ctx.scheduler.runAfter(0, internal.artifactUsage.scan, {
      workspaceId,
      after: last._creationTime,
    })
    return null
  },
})

/**
 * Starts the scan for every workspace that has no usage row. Run once after
 * deploy: `npx convex run artifactUsage:startAll '{"after":null}'`.
 */
export const startAll = internalMutation({
  args: { after: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { after }) => {
    const page = await ctx.db
      .query("workspaces")
      .withIndex("by_creation_time", (q) =>
        after === null ? q : q.gt("_creationTime", after)
      )
      .take(START_PAGE)
    for (const workspace of page)
      if (!(await usageRow(ctx, workspace._id)))
        await startArtifactUsage(ctx, workspace._id)
    const last = page.at(-1)
    if (page.length === START_PAGE && last)
      await ctx.scheduler.runAfter(0, internal.artifactUsage.startAll, {
        after: last._creationTime,
      })
    return null
  },
})
