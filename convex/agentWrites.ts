import {
  createVersionedCollection,
  publishCompatibleSchema,
} from "./lib/collectionSchemas"
import { v, type Infer } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { internalMutation, type MutationCtx } from "./_generated/server"
import { resolveScopedGrant } from "./lib/agentGrant"
import { missingScopeMessage } from "./lib/agentScope"
import { workspaceBudgets } from "./lib/budgets"
import { recordBudgetProblem } from "./lib/recordCounts"
import {
  auditActor,
  recordAuditEvent,
  type AuditActor,
} from "./lib/auditEvents"
import {
  addField as addFieldToDefinition,
  agentFieldValidator,
  agentNewFieldValidator,
  checkCollection,
  recordValuesValidator,
} from "./lib/collectionDomain"
import { checkRecord, resolveFields, resolveNewField } from "./lib/references"
import {
  deleteRecord as removeRecord,
  insertRecord,
  replaceRecordValues,
} from "./lib/records"
import { callerKey, runOnce } from "./lib/operations"

/**
 * Writes made with an agent credential that has the `data.write` scope. convex/http.ts calls these
 * after it parses the request. Each result is a tagged value, so the HTTP
 * layer maps it to a status without parsing error strings.
 *
 * Each write except createRecord takes an optional `idempotencyKey` (see
 * convex/lib/operations.ts). createRecord keeps its own key, which names
 * the record in its collection, not the request.
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
): Promise<
  | Denied
  | {
      status: "ok"
      workspaceId: Id<"workspaces">
      actor: AuditActor
      /** The owner of idempotency keys; see callerKey. */
      caller: string
    }
> {
  const scoped = await resolveScopedGrant(ctx, digest, Date.now(), [
    "data.write",
  ])
  if (scoped.status === "denied")
    return deny("The credential is missing, expired, or revoked.")
  if (scoped.status === "missing_scope")
    return deny(missingScopeMessage(scoped.missing))
  return {
    status: "ok",
    workspaceId: scoped.grant.workspaceId,
    actor: auditActor(scoped.grant.owner, scoped.grant),
    caller: callerKey(scoped.grant),
  }
}

/** Finds a collection in the credential's workspace. */
async function writableCollection(
  ctx: MutationCtx,
  digest: string,
  rawCollectionId: string
): Promise<
  | Denied
  | {
      status: "ok"
      collection: Doc<"collections">
      actor: AuditActor
      caller: string
    }
> {
  const workspace = await writableWorkspace(ctx, digest)
  if (workspace.status !== "ok") return workspace
  const collectionId = ctx.db.normalizeId("collections", rawCollectionId)
  const collection = collectionId && (await ctx.db.get(collectionId))
  if (!collection || collection.workspaceId !== workspace.workspaceId)
    return deny("The collection does not exist in this workspace.")
  return {
    status: "ok",
    collection,
    actor: workspace.actor,
    caller: workspace.caller,
  }
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
    fields: v.array(agentFieldValidator),
    idempotencyKey: v.optional(v.string()),
  },
  returns: createCollectionResult,
  handler: async (
    ctx,
    { digest, idempotencyKey, ...args }
  ): Promise<Infer<typeof createCollectionResult>> => {
    const workspace = await writableWorkspace(ctx, digest)
    if (workspace.status !== "ok") return workspace
    const { name, fields } = args
    return runOnce(
      ctx,
      {
        workspaceId: workspace.workspaceId,
        caller: workspace.caller,
        operation: "collections.create",
        key: idempotencyKey,
        input: args,
      },
      createCollectionResult,
      async (): Promise<Infer<typeof createCollectionResult>> => {
        const resolved = await resolveFields(ctx, workspace.workspaceId, fields)
        if (!resolved.ok) return reject(resolved.message)
        const budgets = await workspaceBudgets(ctx, workspace.workspaceId)
        const checked = checkCollection(
          name,
          resolved.value,
          budgets.indexedFieldsPerCollection
        )
        if (!checked.ok) return reject(checked.message)
        const id = await createVersionedCollection(ctx, {
          workspaceId: workspace.workspaceId,
          name: checked.value.name,
          definition: { version: 1, fields: checked.value.fields },
        })
        await recordAuditEvent(ctx, workspace.workspaceId, workspace.actor, {
          operation: "collection.create",
          collectionId: id,
        })
        return { status: "created", id }
      }
    )
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
    field: agentNewFieldValidator,
    idempotencyKey: v.optional(v.string()),
  },
  returns: addFieldResult,
  handler: async (
    ctx,
    { digest, idempotencyKey, ...args }
  ): Promise<Infer<typeof addFieldResult>> => {
    const found = await writableCollection(ctx, digest, args.collectionId)
    if (found.status !== "ok") return found
    const { collection } = found
    const { field } = args
    return runOnce(
      ctx,
      {
        workspaceId: collection.workspaceId,
        caller: found.caller,
        operation: "collections.addField",
        key: idempotencyKey,
        input: args,
      },
      addFieldResult,
      async (): Promise<Infer<typeof addFieldResult>> => {
        const resolved = await resolveNewField(
          ctx,
          collection.workspaceId,
          field
        )
        if (!resolved.ok) return reject(resolved.message)
        const budgets = await workspaceBudgets(ctx, collection.workspaceId)
        const definition = addFieldToDefinition(
          collection.definition,
          resolved.value,
          budgets.indexedFieldsPerCollection
        )
        if (!definition.ok) return reject(definition.message)
        await publishCompatibleSchema(ctx, collection, definition.value)
        await recordAuditEvent(ctx, collection.workspaceId, found.actor, {
          operation: "collection.addField",
          collectionId: collection._id,
          version: definition.value.version,
        })
        return { status: "added", version: definition.value.version }
      }
    )
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
    const checked = await checkRecord(ctx, collection, values)
    if (!checked.ok) return reject(checked.message)
    const overBudget = await recordBudgetProblem(ctx, collection)
    if (overBudget) return reject(overBudget)
    const id = await insertRecord(
      ctx,
      collection,
      checked.value,
      idempotencyKey
    )
    await recordAuditEvent(ctx, collection.workspaceId, found.actor, {
      operation: "record.create",
      collectionId: collection._id,
      recordId: id,
    })
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
    idempotencyKey: v.optional(v.string()),
  },
  returns: updateRecordResult,
  handler: async (
    ctx,
    { digest, idempotencyKey, ...args }
  ): Promise<Infer<typeof updateRecordResult>> => {
    const found = await writableCollection(ctx, digest, args.collectionId)
    if (found.status !== "ok") return found
    const { collection } = found
    return runOnce(
      ctx,
      {
        workspaceId: collection.workspaceId,
        caller: found.caller,
        operation: "records.update",
        key: idempotencyKey,
        input: args,
      },
      updateRecordResult,
      async (): Promise<Infer<typeof updateRecordResult>> => {
        const recordId = ctx.db.normalizeId("collectionRecords", args.recordId)
        const record = recordId && (await ctx.db.get(recordId))
        if (!record || record.collectionId !== collection._id)
          return deny("The record does not exist in this collection.")
        if (record.revision !== args.expectedRevision)
          return { status: "conflict", revision: record.revision }
        const checked = await checkRecord(ctx, collection, args.values)
        if (!checked.ok) return reject(checked.message)
        const revision = await replaceRecordValues(
          ctx,
          collection,
          record,
          checked.value
        )
        await recordAuditEvent(ctx, collection.workspaceId, found.actor, {
          operation: "record.update",
          collectionId: collection._id,
          recordId: record._id,
          revision,
        })
        return { status: "updated", revision }
      }
    )
  },
})

const deleteRecordResult = v.union(
  denied,
  v.object({ status: v.literal("conflict"), revision: v.number() }),
  v.object({
    status: v.literal("referenced"),
    recordId: v.id("collectionRecords"),
  }),
  v.object({ status: v.literal("deleted") })
)

/** Deletes a record when its revision is still `expectedRevision`. */
export const deleteRecord = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    recordId: v.string(),
    expectedRevision: v.number(),
    idempotencyKey: v.optional(v.string()),
  },
  returns: deleteRecordResult,
  handler: async (
    ctx,
    { digest, idempotencyKey, ...args }
  ): Promise<Infer<typeof deleteRecordResult>> => {
    const found = await writableCollection(ctx, digest, args.collectionId)
    if (found.status !== "ok") return found
    const { collection } = found
    return runOnce(
      ctx,
      {
        workspaceId: collection.workspaceId,
        caller: found.caller,
        operation: "records.delete",
        key: idempotencyKey,
        input: args,
      },
      deleteRecordResult,
      async (): Promise<Infer<typeof deleteRecordResult>> => {
        const recordId = ctx.db.normalizeId("collectionRecords", args.recordId)
        const record = recordId && (await ctx.db.get(recordId))
        if (!record || record.collectionId !== collection._id)
          return deny("The record does not exist in this collection.")
        if (record.revision !== args.expectedRevision)
          return { status: "conflict", revision: record.revision }
        const referencedBy = await removeRecord(ctx, record._id)
        if (referencedBy)
          return { status: "referenced", recordId: referencedBy }
        await recordAuditEvent(ctx, collection.workspaceId, found.actor, {
          operation: "record.delete",
          collectionId: collection._id,
          recordId: record._id,
        })
        return { status: "deleted" }
      }
    )
  },
})
