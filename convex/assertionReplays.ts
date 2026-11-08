import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"

const PAGE = 200

/** Deletes recorded `jti` values of expired tokens (convex/lib/assertionReplay.ts). */
export const prune = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("assertionReplays")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(PAGE)
    for (const row of expired) await ctx.db.delete(row._id)
    if (expired.length === PAGE)
      await ctx.scheduler.runAfter(0, internal.assertionReplays.prune, {})
    return null
  },
})
