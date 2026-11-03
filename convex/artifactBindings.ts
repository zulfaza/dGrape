import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { mutation, query, type QueryCtx } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import { bindingFields, supportsRelation } from "./lib/artifactBindingDomain"

async function recordWorkspace(
  ctx: QueryCtx,
  recordId: Id<"collectionRecords">
) {
  const record = await ctx.db.get(recordId)
  const collection = record && (await ctx.db.get(record.collectionId))
  if (!collection) throw new Error("Record unavailable")
  await requireMembership(ctx, collection.workspaceId)
  return collection.workspaceId
}
export const bind = mutation({
  args: bindingFields,
  returns: v.id("artifactBindings"),
  handler: async (ctx, args) => {
    const workspaceId = await recordWorkspace(ctx, args.recordId)
    const artifact = await ctx.db.get(args.artifactId)
    if (!artifact || artifact.workspaceId !== workspaceId)
      throw new Error("Artifact unavailable in this workspace")
    if (!supportsRelation(artifact.contentType, args.relation))
      throw new Error("File type does not support this relation")
    const bindings = await ctx.db
      .query("artifactBindings")
      .withIndex("by_recordId", (q) => q.eq("recordId", args.recordId))
      .take(21)
    const existing = bindings.find(
      (b) => b.artifactId === args.artifactId && b.relation === args.relation
    )
    if (existing) return existing._id
    if (bindings.length >= 20)
      throw new Error("A record supports at most 20 file links")
    return ctx.db.insert("artifactBindings", args)
  },
})
export const unbind = mutation({
  args: bindingFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordWorkspace(ctx, args.recordId)
    const rows = await ctx.db
      .query("artifactBindings")
      .withIndex("by_recordId", (q) => q.eq("recordId", args.recordId))
      .take(20)
    const row = rows.find(
      (b) => b.artifactId === args.artifactId && b.relation === args.relation
    )
    if (row) await ctx.db.delete(row._id)
    return null
  },
})
export const list = query({
  args: { recordId: v.id("collectionRecords") },
  returns: v.array(
    v.object({ ...bindingFields, name: v.union(v.string(), v.null()) })
  ),
  handler: async (ctx, { recordId }) => {
    const workspaceId = await recordWorkspace(ctx, recordId)
    const rows = await ctx.db
      .query("artifactBindings")
      .withIndex("by_recordId", (q) => q.eq("recordId", recordId))
      .take(20)
    return Promise.all(
      rows.map(async (row) => {
        const artifact = await ctx.db.get(row.artifactId)
        return {
          recordId,
          artifactId: row.artifactId,
          relation: row.relation,
          name: artifact?.workspaceId === workspaceId ? artifact.name : null,
        }
      })
    )
  },
})
