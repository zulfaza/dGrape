import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import { agentOperation, runOnce } from "./lib/operations"
import { requireMembership } from "./lib/auth"
import {
  auditActor,
  recordAuditEvent,
  type AuditActor,
} from "./lib/auditEvents"
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

/**
 * Changes the label of one field. The field ID stays, so values, projections,
 * and reference bindings are kept. Throws "Schema revision conflict" when the
 * collection is not at `expectedVersion`. Returns the new definition.
 */
export async function renameFieldLabel(
  ctx: MutationCtx,
  collection: Doc<"collections">,
  actor: AuditActor,
  { expectedVersion, fieldId, label }: RenameField
) {
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
  await recordAuditEvent(ctx, collection.workspaceId, actor, {
    operation: "collection.renameField",
    collectionId: collection._id,
    version: definition.version,
  })
  return definition
}

type RenameField = { expectedVersion: number; fieldId: string; label: string }

/** A rename preserves field identity, values, projections, and reference bindings. */
export const renameField = mutation({
  args: {
    collectionId: v.id("collections"),
    expectedVersion: v.number(),
    fieldId: v.string(),
    label: v.string(),
  },
  returns: collectionDefinitionValidator,
  handler: async (ctx, { collectionId, ...rename }) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Collection access denied")
    const member = await requireMembership(ctx, collection.workspaceId)
    return renameFieldLabel(
      ctx,
      collection,
      { kind: "user", userId: member.userId },
      rename
    )
  },
})

/** renameField for an agent credential with the data.write scope. */
const renamedField = v.object({ version: v.number() })

export const renameFieldForAgent = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    expectedVersion: v.number(),
    fieldId: v.string(),
    label: v.string(),
    /** See convex/lib/operations.ts. */
    idempotencyKey: v.optional(v.string()),
  },
  returns: renamedField,
  handler: (ctx, { digest, idempotencyKey, ...input }) =>
    withGrant(ctx, digest, Date.now(), ["data.write"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "collections.renameField", idempotencyKey, input),
        renamedField,
        async () => {
          const { collectionId, ...rename } = input
          const id = ctx.db.normalizeId("collections", collectionId)
          const collection = id && (await ctx.db.get(id))
          if (!collection || collection.workspaceId !== grant.workspaceId)
            throw new Error("Collection access denied")
          const { version } = await renameFieldLabel(
            ctx,
            collection,
            auditActor(grant.owner, grant),
            rename
          )
          return { version }
        }
      )
    ),
})
