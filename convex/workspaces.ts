import {
  createVersionedCollection,
  publishCompatibleSchema,
} from "./lib/collectionSchemas"
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import { mutation, query } from "./_generated/server"
import { requireMembership, requireUserId } from "./lib/auth"
import type { WorkspaceAccess } from "./lib/workspaceRoles"
import { EMPTY_ARTIFACT_USAGE } from "./lib/artifactUsage"
import { workspaceBudgets } from "./lib/budgets"
import { recordCountValidator } from "./lib/recordCounts"
import { recordAuditEvent } from "./lib/auditEvents"
import {
  addField as addFieldToDefinition,
  checkCollection,
  collectionDefinitionValidator,
  collectionFieldValidator,
  newCollectionFieldValidator,
  collectionRecordValidator,
  recordValuesValidator,
  type RecordValues,
} from "./lib/collectionDomain"
import {
  checkRecord,
  referenceLabel as readReferenceLabel,
  resolveFields,
  resolveNewField,
} from "./lib/references"
import {
  deleteRecord as removeRecord,
  insertRecord,
  replaceRecordValues,
} from "./lib/records"
import {
  queryRecords as readRecordQuery,
  recordQueryValidator,
} from "./lib/recordQuery"

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
        return { ...workspace, role: member.role }
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
    await ctx.db.insert("workspaceUsage", {
      workspaceId,
      artifacts: EMPTY_ARTIFACT_USAGE,
    })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      role: "owner",
    })
    await recordAuditEvent(
      ctx,
      workspaceId,
      { kind: "user", userId },
      { operation: "workspace.create" }
    )
    return workspaceId
  },
})

export const get = query({
  args: { workspaceId: v.string() },
  handler: async (ctx, { workspaceId: rawId }) => {
    const workspaceId = ctx.db.normalizeId("workspaces", rawId)
    if (!workspaceId) throw new Error("Workspace access denied")
    const member = await requireMembership(ctx, workspaceId, "read")
    const workspace = await ctx.db.get(workspaceId)
    if (!workspace) throw new Error("Workspace not found")
    /** The caller's role, so the UI offers only what the role allows. */
    return { ...workspace, role: member.role }
  },
})

export const listCollections = query({
  args: { workspaceId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { workspaceId: rawId, paginationOpts }) => {
    const workspaceId = ctx.db.normalizeId("workspaces", rawId)
    if (!workspaceId) throw new Error("Workspace access denied")
    await requireMembership(ctx, workspaceId, "read")
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
    const member = await requireMembership(ctx, workspaceId, "write")
    const resolved = await resolveFields(ctx, workspaceId, fields)
    if (!resolved.ok) throw new Error(resolved.message)
    const budgets = await workspaceBudgets(ctx, workspaceId)
    const checked = checkCollection(
      name,
      resolved.value,
      budgets.indexedFieldsPerCollection
    )
    if (!checked.ok) throw new Error(checked.message)
    const collectionId = await createVersionedCollection(ctx, {
      workspaceId,
      name: checked.value.name,
      definition: { version: 1, fields: checked.value.fields },
    })
    await recordAuditEvent(
      ctx,
      workspaceId,
      { kind: "user", userId: member.userId },
      { operation: "collection.create", collectionId }
    )
    return collectionId
  },
})

const collectionValidator = v.object({
  dataRevision: v.optional(v.number()),
  recordCount: v.optional(recordCountValidator),
  _id: v.id("collections"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  name: v.string(),
  definition: collectionDefinitionValidator,
})

async function collectionForRecords(
  ctx: QueryCtx,
  collectionId: Id<"collections">,
  access: WorkspaceAccess
) {
  const collection = await ctx.db.get(collectionId)
  if (!collection) throw new Error("Collection access denied")
  await requireMembership(ctx, collection.workspaceId, access)
  return collection
}

async function validateRecord(
  ctx: QueryCtx,
  collection: Doc<"collections">,
  values: RecordValues
) {
  const checked = await checkRecord(ctx, collection, values)
  if (!checked.ok) throw new Error(checked.message)
}

export const getCollection = query({
  returns: collectionValidator,
  args: { collectionId: v.id("collections") },
  handler: async (ctx, { collectionId }) =>
    collectionForRecords(ctx, collectionId, "read"),
})

export const listRecords = query({
  returns: paginationResultValidator(collectionRecordValidator),
  args: {
    collectionId: v.id("collections"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { collectionId, paginationOpts }) => {
    await collectionForRecords(ctx, collectionId, "read")
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

/** Reads a page of records filtered and sorted by one indexed field. */
export const queryRecords = query({
  returns: paginationResultValidator(collectionRecordValidator),
  args: {
    collectionId: v.id("collections"),
    query: recordQueryValidator,
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, { collectionId, query, paginationOpts }) => {
    const collection = await collectionForRecords(ctx, collectionId, "read")
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Invalid page size")
    const result = await readRecordQuery(ctx, collection, query, paginationOpts)
    if (!result.ok) throw new Error(result.message)
    return result.value
  },
})

/**
 * The label of a record or artifact that a record of the collection
 * references. Null when the ID is not in the workspace.
 */
export const referenceLabel = query({
  args: { collectionId: v.id("collections"), id: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { collectionId, id }) => {
    const collection = await collectionForRecords(ctx, collectionId, "read")
    return readReferenceLabel(ctx, collection.workspaceId, id)
  },
})

export const getRecord = query({
  returns: collectionRecordValidator,
  args: {
    collectionId: v.id("collections"),
    recordId: v.id("collectionRecords"),
  },
  handler: async (ctx, { collectionId, recordId }) => {
    await collectionForRecords(ctx, collectionId, "read")
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
    const collection = await collectionForRecords(ctx, collectionId, "write")
    await validateRecord(ctx, collection, values)
    const recordId = await insertRecord(ctx, collection, values)
    await recordAuditEvent(
      ctx,
      collection.workspaceId,
      { kind: "user", userId: await requireUserId(ctx) },
      { operation: "record.create", collectionId, recordId }
    )
    return recordId
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
    const collection = await collectionForRecords(ctx, collectionId, "write")
    const record = await ctx.db.get(recordId)
    if (!record || record.collectionId !== collectionId)
      throw new Error("Record not found")
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
      throw new Error("Invalid revision")
    if (record.revision !== expectedRevision) return "conflict"
    await validateRecord(ctx, collection, values)
    const revision = await replaceRecordValues(ctx, collection, record, values)
    await recordAuditEvent(
      ctx,
      collection.workspaceId,
      { kind: "user", userId: await requireUserId(ctx) },
      { operation: "record.update", collectionId, recordId, revision }
    )
    return "updated"
  },
})

/**
 * Deletes a record when its revision is still `expectedRevision`. Returns
 * "conflict" when someone changed it after the caller read it, and
 * "referenced" when another record references it.
 */
export const deleteRecord = mutation({
  returns: v.union(
    v.literal("conflict"),
    v.literal("referenced"),
    v.literal("deleted")
  ),
  args: {
    collectionId: v.id("collections"),
    recordId: v.id("collectionRecords"),
    expectedRevision: v.number(),
  },
  handler: async (ctx, { collectionId, recordId, expectedRevision }) => {
    const collection = await collectionForRecords(ctx, collectionId, "write")
    const record = await ctx.db.get(recordId)
    if (!record || record.collectionId !== collectionId)
      throw new Error("Record not found")
    if (record.revision !== expectedRevision) return "conflict"
    if (await removeRecord(ctx, recordId)) return "referenced"
    await recordAuditEvent(
      ctx,
      collection.workspaceId,
      { kind: "user", userId: await requireUserId(ctx) },
      { operation: "record.delete", collectionId, recordId }
    )
    return "deleted"
  },
})

/**
 * Adds an optional field to a collection. The records that exist stay valid
 * and have no value for the new field.
 */
export const addField = mutation({
  returns: v.null(),
  args: {
    collectionId: v.id("collections"),
    field: newCollectionFieldValidator,
  },
  handler: async (ctx, { collectionId, field }) => {
    const collection = await collectionForRecords(ctx, collectionId, "write")
    const resolved = await resolveNewField(ctx, collection.workspaceId, field)
    if (!resolved.ok) throw new Error(resolved.message)
    const budgets = await workspaceBudgets(ctx, collection.workspaceId)
    const definition = addFieldToDefinition(
      collection.definition,
      resolved.value,
      budgets.indexedFieldsPerCollection
    )
    if (!definition.ok) throw new Error(definition.message)
    await publishCompatibleSchema(ctx, collection, definition.value)
    await recordAuditEvent(
      ctx,
      collection.workspaceId,
      { kind: "user", userId: await requireUserId(ctx) },
      {
        operation: "collection.addField",
        collectionId,
        version: definition.value.version,
      }
    )
    return null
  },
})
