import {
  createVersionedCollection,
  publishCompatibleSchema,
} from "./lib/collectionSchemas"
import { v, type Infer } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation, type MutationCtx } from "./_generated/server"
import { resolveGrant } from "./lib/agentGrant"
import {
  addField as addFieldToDefinition,
  checkCollection,
  checkRecordValues,
  collectionFieldValidator,
  recordValuesValidator,
} from "./lib/collectionDomain"
import {
  deleteRecord as removeRecord,
  insertRecord,
  replaceRecordValues,
} from "./lib/records"

/**
 * Writes made with a "readwrite" agent credential. convex/http.ts calls these
 * after it parses the request. Each result is a tagged value, so the HTTP
 * layer maps it to a status without parsing error strings.
 */

const MAX_IDEMPOTENCY_KEY_LENGTH = 200

const denied = v.object({ status: v.literal("denied"), message: v.string() })
const invalid = v.object({ status: v.literal("invalid"), message: v.string() })

type Denied = { status: "denied"; message: string }
type Invalid = { status: "invalid"; message: string }

const deny = (message: string): Denied => ({ status: "denied", message })
const reject = (message: string): Invalid => ({ status: "invalid", message })

/** Resolves a credential that may write, or explains why it may not. */
async function writableWorkspace(
  ctx: MutationCtx,
  digest: string
): Promise<Denied | { status: "ok"; workspaceId: Id<"workspaces"> }> {
  const grant = await resolveGrant(ctx, digest, Date.now())
  if (!grant) return deny("The credential is missing, expired, or revoked.")
  if (grant.scope !== "readwrite")
    return deny("This credential is read-only. Create a read-and-write one.")
  return { status: "ok", workspaceId: grant.workspaceId }
}

/** Finds a collection in the credential's workspace. */
async function writableCollection(
  ctx: MutationCtx,
  digest: string,
  rawCollectionId: string
): Promise<Denied | { status: "ok"; collection: Doc<"collections"> }> {
  const workspace = await writableWorkspace(ctx, digest)
  if (workspace.status !== "ok") return workspace
  const collectionId = ctx.db.normalizeId("collections", rawCollectionId)
  const collection = collectionId && (await ctx.db.get(collectionId))
  if (!collection || collection.workspaceId !== workspace.workspaceId)
    return deny("The collection does not exist in this workspace.")
  return { status: "ok", collection }
}

const createCollectionResult = v.union(
  denied,
  invalid,
  v.object({ status: v.literal("created"), id: v.id("collections") })
)

export const createCollection = internalMutation({
  args: {
    digest: v.string(),
    name: v.string(),
    fields: v.array(collectionFieldValidator),
  },
  returns: createCollectionResult,
  handler: async (
    ctx,
    { digest, name, fields }
  ): Promise<Infer<typeof createCollectionResult>> => {
    const workspace = await writableWorkspace(ctx, digest)
    if (workspace.status !== "ok") return workspace
    const checked = checkCollection(name, fields)
    if (!checked.ok) return reject(checked.message)
    const id = await createVersionedCollection(ctx, {
      workspaceId: workspace.workspaceId,
      name: checked.value.name,
      definition: { version: 1, fields: checked.value.fields },
    })
    return { status: "created", id }
  },
})

const addFieldResult = v.union(
  denied,
  invalid,
  v.object({ status: v.literal("added"), version: v.number() })
)

/** Adds an optional field. The records that exist stay valid. */
export const addField = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    field: collectionFieldValidator.omit("optional"),
  },
  returns: addFieldResult,
  handler: async (
    ctx,
    { digest, collectionId, field }
  ): Promise<Infer<typeof addFieldResult>> => {
    const found = await writableCollection(ctx, digest, collectionId)
    if (found.status !== "ok") return found
    const { collection } = found
    const definition = addFieldToDefinition(collection.definition, field)
    if (!definition.ok) return reject(definition.message)
    await publishCompatibleSchema(ctx, collection, definition.value)
    return { status: "added", version: definition.value.version }
  },
})

const createRecordResult = v.union(
  denied,
  invalid,
  v.object({
    status: v.union(v.literal("created"), v.literal("existing")),
    id: v.id("collectionRecords"),
    revision: v.number(),
  })
)

export const createRecord = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    values: recordValuesValidator,
    idempotencyKey: v.optional(v.string()),
  },
  returns: createRecordResult,
  handler: async (
    ctx,
    { digest, collectionId, values, idempotencyKey }
  ): Promise<Infer<typeof createRecordResult>> => {
    const found = await writableCollection(ctx, digest, collectionId)
    if (found.status !== "ok") return found
    const { collection } = found
    if (
      idempotencyKey !== undefined &&
      (!idempotencyKey || idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH)
    )
      return reject(
        `idempotencyKey must be 1 to ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`
      )
    if (idempotencyKey) {
      const existing = await ctx.db
        .query("collectionRecords")
        .withIndex("by_collection_idempotencyKey", (q) =>
          q
            .eq("collectionId", collection._id)
            .eq("idempotencyKey", idempotencyKey)
        )
        .unique()
      if (existing)
        return {
          status: "existing",
          id: existing._id,
          revision: existing.revision,
        }
    }
    const checked = checkRecordValues(collection.definition.fields, values)
    if (!checked.ok) return reject(checked.message)
    const id = await insertRecord(
      ctx,
      collection,
      checked.value,
      idempotencyKey
    )
    return { status: "created", id, revision: 1 }
  },
})

const updateRecordResult = v.union(
  denied,
  invalid,
  v.object({ status: v.literal("conflict"), revision: v.number() }),
  v.object({ status: v.literal("updated"), revision: v.number() })
)

export const updateRecord = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    recordId: v.string(),
    expectedRevision: v.number(),
    values: recordValuesValidator,
  },
  returns: updateRecordResult,
  handler: async (ctx, args): Promise<Infer<typeof updateRecordResult>> => {
    const found = await writableCollection(ctx, args.digest, args.collectionId)
    if (found.status !== "ok") return found
    const { collection } = found
    const recordId = ctx.db.normalizeId("collectionRecords", args.recordId)
    const record = recordId && (await ctx.db.get(recordId))
    if (!record || record.collectionId !== collection._id)
      return deny("The record does not exist in this collection.")
    if (record.revision !== args.expectedRevision)
      return { status: "conflict", revision: record.revision }
    const checked = checkRecordValues(collection.definition.fields, args.values)
    if (!checked.ok) return reject(checked.message)
    const revision = await replaceRecordValues(
      ctx,
      collection,
      record,
      checked.value
    )
    return { status: "updated", revision }
  },
})

const deleteRecordResult = v.union(
  denied,
  v.object({ status: v.literal("conflict"), revision: v.number() }),
  v.object({ status: v.literal("deleted") })
)

/** Deletes a record when its revision is still `expectedRevision`. */
export const deleteRecord = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    recordId: v.string(),
    expectedRevision: v.number(),
  },
  returns: deleteRecordResult,
  handler: async (ctx, args): Promise<Infer<typeof deleteRecordResult>> => {
    const found = await writableCollection(ctx, args.digest, args.collectionId)
    if (found.status !== "ok") return found
    const recordId = ctx.db.normalizeId("collectionRecords", args.recordId)
    const record = recordId && (await ctx.db.get(recordId))
    if (!record || record.collectionId !== found.collection._id)
      return deny("The record does not exist in this collection.")
    if (record.revision !== args.expectedRevision)
      return { status: "conflict", revision: record.revision }
    await removeRecord(ctx, record._id)
    return { status: "deleted" }
  },
})
