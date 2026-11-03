import { internalQuery } from "./_generated/server"
import { v } from "convex/values"
export const lookup = internalQuery({
  args: { rawId: v.string() },
  returns: v.id("secretRefs"),
  handler: async (ctx, { rawId }) => {
    const id = ctx.db.normalizeId("secretRefs", rawId)
    if (!id) throw new Error("Secret access denied")
    return id
  },
})
