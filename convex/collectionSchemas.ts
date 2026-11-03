import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import { collectionDefinitionValidator } from "./lib/collectionDomain"
import { publishCompatibleSchema } from "./lib/collectionSchemas"

export const history = query({
  args: {
    collectionId: v.id("collections"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("collectionSchemaVersions"),
      _creationTime: v.number(),
      collectionId: v.id("collections"),
      definition: collectionDefinitionValidator,
    })
  ),
  handler: async (ctx, { collectionId, paginationOpts }) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Collection access denied")
    await requireMembership(ctx, collection.workspaceId)
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Page size must be between 1 and 50")
    return ctx.db
      .query("collectionSchemaVersions")
      .withIndex("by_collectionId_and_version", (q) =>
        q.eq("collectionId", collectionId)
      )
      .order("desc")
      .paginate(paginationOpts)
  },
})

/** Read an exact definition; never substitute a different historical version. */
export const get = query({
  args: { collectionId: v.id("collections"), version: v.number() },
  returns: v.union(v.null(), collectionDefinitionValidator),
  handler: async (ctx, { collectionId, version }) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Collection access denied")
    await requireMembership(ctx, collection.workspaceId)
    if (!Number.isSafeInteger(version) || version < 1)
      throw new Error("Invalid version")
    const stored = await ctx.db
      .query("collectionSchemaVersions")
      .withIndex("by_collectionId_and_version", (q) =>
        q.eq("collectionId", collectionId).eq("definition.version", version)
      )
      .unique()
    return (
      stored?.definition ??
      (collection.definition.version === version ? collection.definition : null)
    )
  },
})

/** A rename preserves field identity, values, projections, and reference bindings. */
export const renameField = mutation({
  args: {
    collectionId: v.id("collections"),
    expectedVersion: v.number(),
    fieldId: v.string(),
    label: v.string(),
  },
  returns: collectionDefinitionValidator,
  handler: async (ctx, { collectionId, expectedVersion, fieldId, label }) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Collection access denied")
    await requireMembership(ctx, collection.workspaceId)
    if (
      !Number.isSafeInteger(expectedVersion) ||
      collection.definition.version !== expectedVersion
    )
      throw new Error("Schema revision conflict")
    if (!collection.definition.fields.some((field) => field.id === fieldId))
      throw new Error("Unknown field")
    const definition = {
      version: expectedVersion + 1,
      fields: collection.definition.fields.map((field) =>
        field.id === fieldId ? { ...field, label: label.trim() } : field
      ),
    }
    await publishCompatibleSchema(ctx, collection, definition)
    return definition
  },
})
