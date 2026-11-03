import { v } from "convex/values"
import { query } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import {
  sourceFreshness,
  sourceStatusValidator,
  type SourceStatus,
} from "./lib/sourceSync"

/** Freshness of the collections that recipes write, at most 50. */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(sourceStatusValidator),
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId)
    const syncs = await ctx.db
      .query("sourceSyncs")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50)
    const result: SourceStatus[] = []
    for (const sync of syncs) {
      const collection = await ctx.db.get(sync.collectionId)
      if (collection?.workspaceId === args.workspaceId)
        result.push({
          collectionId: collection._id,
          name: collection.name,
          freshness: sourceFreshness(sync),
        })
    }
    return result
  },
})
