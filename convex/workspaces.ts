import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireMembership, requireUserId } from "./lib/auth"
import { collectionFieldValidator } from "./lib/collectionDomain"

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

export const get = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId: rawId }) => {
    const workspaceId = ctx.db.normalizeId("workspaces", rawId)
    if (!workspaceId) throw new Error("Workspace access denied")
    await requireMembership(ctx, workspaceId)
    const workspace = await ctx.db.get(workspaceId)
    if (!workspace) throw new Error("Workspace not found")
    return workspace
  },
})

export const listCollections = query({
  args: { workspaceId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { workspaceId: rawId, paginationOpts }) => {
    const workspaceId = ctx.db.normalizeId("workspaces", rawId)
    if (!workspaceId) throw new Error("Workspace access denied")
    await requireMembership(ctx, workspaceId)
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Page size must be between 1 and 50")
    return ctx.db
      .query("collections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .paginate(paginationOpts)
  },
})

export const createCollection = mutation({
  args: {
    workspaceId: v.string(),
    name: v.string(),
    fields: v.array(collectionFieldValidator),
  },
  handler: async (ctx, { workspaceId: rawId, name, fields }) => {
    const workspaceId = ctx.db.normalizeId("workspaces", rawId)
    if (!workspaceId) throw new Error("Workspace access denied")
    await requireMembership(ctx, workspaceId)
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 100)
      throw new Error("Name must be between 1 and 100 characters")
    if (fields.length < 1 || fields.length > 50)
      throw new Error("Add 1 to 50 fields")
    const ids = new Set<string>()
    const normalized = fields.map((field) => {
      const label = field.label.trim()
      if (!label || label.length > 100)
        throw new Error("Field label must be between 1 and 100 characters")
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(field.id) || ids.has(field.id))
        throw new Error(
          "Field IDs must be unique and use lowercase letters, numbers, or underscores"
        )
      ids.add(field.id)
      return { ...field, label }
    })
    return ctx.db.insert("collections", {
      workspaceId,
      name: trimmed,
      definition: { version: 1, fields: normalized },
    })
  },
})
