import { v } from "convex/values"
import { query } from "./_generated/server"

export const listNumbers = query({
  args: {
    count: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) {
      throw new Error("Not authenticated")
    }
    const numbers = await ctx.db
      .query("numbers")
      // Ordered by _creationTime, return most recent
      .order("desc")
      .take(args.count)

    const name = (identity["properties.name"] ||
      [
        identity["properties.first_name"],
        identity["properties.last_name"],
      ].join(" ")) as string

    return {
      viewer: name,
      numbers: numbers.reverse().map((number) => number.value),
    }
  },
})
