import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
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

const recordValuesValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean())
)

const collectionValidator = v.object({
  _id: v.id("collections"), _creationTime: v.number(),
  workspaceId: v.id("workspaces"), name: v.string(),
  definition: v.object({ version: v.literal(1), fields: v.array(collectionFieldValidator) }),
})
const recordValidator = v.object({
  _id: v.id("collectionRecords"), _creationTime: v.number(),
  collectionId: v.id("collections"), schemaVersion: v.literal(1),
  revision: v.number(), values: recordValuesValidator,
})

async function collectionForRecords(
  ctx: QueryCtx,
  collectionId: Id<"collections">
) {
  const collection = await ctx.db.get(collectionId)
  if (!collection) throw new Error("Collection access denied")
  await requireMembership(ctx, collection.workspaceId)
  return collection
}

function validateRecord(
  fields: Doc<"collections">["definition"]["fields"],
  values: Record<string, string | number | boolean>
) {
  if (Object.keys(values).length !== fields.length)
    throw new Error("Invalid record")
  let size = 0
  for (const field of fields) {
    if (!Object.hasOwn(values, field.id)) throw new Error("Invalid record")
    const value = values[field.id]
    if (field.type === "text") {
      if (typeof value !== "string" || value.length > 10000)
        throw new Error("Invalid record")
      size += value.length
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value))
        throw new Error("Invalid record")
    } else if (typeof value !== "boolean") throw new Error("Invalid record")
  }
  if (size > 50000) throw new Error("Invalid record")
}

export const getCollection = query({
  returns: collectionValidator,
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) =>
    collectionForRecords(ctx, collectionId),
})

export const listRecords = query({
  returns: paginationResultValidator(recordValidator),
  args: {
    collectionId: v.id("collections"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { collectionId, paginationOpts }) => {
    await collectionForRecords(ctx, collectionId)
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Invalid page size")
    return ctx.db
      .query("collectionRecords")
      .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
      .paginate(paginationOpts)
  },
})

export const getRecord = query({
  returns: recordValidator,
  args: {
    collectionId: v.id("collections"),
    recordId: v.id("collectionRecords"),
  },
  handler: async (ctx, { collectionId, recordId }) => {
    await collectionForRecords(ctx, collectionId)
    const record = await ctx.db.get(recordId)
    if (!record || record.collectionId !== collectionId)
      throw new Error("Record not found")
    return record
  },
})

export const createRecord = mutation({
  returns: v.id("collectionRecords"),
  args: { collectionId: v.id("collections"), values: recordValuesValidator },
  handler: async (ctx, { collectionId, values }) => {
    const collection = await collectionForRecords(ctx, collectionId)
    validateRecord(collection.definition.fields, values)
    return ctx.db.insert("collectionRecords", {
      collectionId,
      schemaVersion: 1,
      revision: 1,
      values,
    })
  },
})

export const updateRecord = mutation({
  returns: v.union(v.literal("conflict"), v.literal("updated")),
  args: {
    collectionId: v.id("collections"),
    recordId: v.id("collectionRecords"),
    expectedRevision: v.number(),
    values: recordValuesValidator,
  },
  handler: async (
    ctx,
    { collectionId, recordId, expectedRevision, values }
  ) => {
    const collection = await collectionForRecords(ctx, collectionId)
    const record = await ctx.db.get(recordId)
    if (!record || record.collectionId !== collectionId)
      throw new Error("Record not found")
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      throw new Error("Invalid revision")
    if (record.revision !== expectedRevision) return "conflict"
    validateRecord(collection.definition.fields, values)
    await ctx.db.patch(recordId, { values, revision: record.revision + 1 })
    return "updated"
  },
})
