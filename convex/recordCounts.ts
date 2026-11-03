import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { startRecordCount } from "./lib/recordCounts"

/** Records read per scan step. Records hold at most ~60 KB of values each. */
const SCAN_PAGE = 100
const START_PAGE = 100

/**
 * Counts one page of a collection's records after `after`, then schedules
 * the next page. A step whose `after` no longer matches the stored state is
 * a duplicate and does nothing. See convex/lib/recordCounts.ts.
 */
export const scan = internalMutation({
  args: {
    collectionId: v.id("collections"),
    after: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { collectionId, after }) => {
    const collection = await ctx.db.get(collectionId)
    const state = collection?.recordCount
    if (!state || state.kind !== "counting" || state.after !== after)
      return null
    const page = await ctx.db
      .query("collectionRecords")
      .withIndex("by_collection", (q) =>
        after === null
          ? q.eq("collectionId", collectionId)
          : q.eq("collectionId", collectionId).gt("_creationTime", after)
      )
      .take(SCAN_PAGE)
    const count = state.count + page.length
    const last = page.at(-1)
    if (page.length < SCAN_PAGE || !last) {
      await ctx.db.patch(collectionId, {
        recordCount: { kind: "counted", count },
      })
      return null
    }
    await ctx.db.patch(collectionId, {
      recordCount: { kind: "counting", after: last._creationTime, count },
    })
    await ctx.scheduler.runAfter(0, internal.recordCounts.scan, {
      collectionId,
      after: last._creationTime,
    })
    return null
  },
})

/**
 * Starts the scan for every collection that has no count. Run once after
 * deploy: `npx convex run recordCounts:startAll '{"after":null}'`.
 */
export const startAll = internalMutation({
  args: { after: v.union(v.number(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { after }) => {
    const page = await ctx.db
      .query("collections")
      .withIndex("by_creation_time", (q) =>
        after === null ? q : q.gt("_creationTime", after)
      )
      .take(START_PAGE)
    for (const collection of page)
      if (!collection.recordCount) await startRecordCount(ctx, collection._id)
    const last = page.at(-1)
    if (page.length === START_PAGE && last)
      await ctx.scheduler.runAfter(0, internal.recordCounts.startAll, {
        after: last._creationTime,
      })
    return null
  },
})
