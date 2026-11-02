import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireUserId } from "./lib/auth"

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await requireUserId(ctx)
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    ) {
      throw new Error("Page size must be between 1 and 50")
    }
    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate(paginationOpts)
    const page = await Promise.all(
      memberships.page.map(async (member) => {
        const workspace = await ctx.db.get(member.workspaceId)
        if (!workspace) throw new Error("Workspace not found")
        return workspace
      })
    )
    return { ...memberships, page }
  },
})

export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await requireUserId(ctx)
    const trimmed = name.trim()
    if (trimmed.length === 0 || trimmed.length > 100)
      throw new Error("Name must be between 1 and 100 characters")
    const workspaceId = await ctx.db.insert("workspaces", { name: trimmed })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
    })
    return workspaceId
  },
})
