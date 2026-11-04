import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"

const PAGE = 200

/**
 * Deletes expired idempotency rows (see convex/lib/operations.ts), one page
 * at a time, until none is left. The hourly cron in convex/crons.ts starts
 * it, so a row stays at most about one hour after it expires.
 */
export const prune = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("operations")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", Date.now()))
      .take(PAGE)
    for (const operation of expired) await ctx.db.delete(operation._id)
    if (expired.length === PAGE)
      await ctx.scheduler.runAfter(0, internal.operations.prune, {})
    return null
  },
})
