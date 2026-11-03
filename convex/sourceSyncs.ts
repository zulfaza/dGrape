import { v } from "convex/values"
import { query } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import {
  readSourceStatus,
  sourceStatusValidator,
  type SourceStatus,
} from "./lib/sourceSync"

/**
 * Freshness of the workspace collections, at most 50. A collection that no
 * recipe run has finished writing is "never_synced".
 */
export const list = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(sourceStatusValidator),
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId)
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50)
    const result: SourceStatus[] = []
    for (const collection of collections)
      result.push(await readSourceStatus(ctx, collection))
    return result
  },
})
