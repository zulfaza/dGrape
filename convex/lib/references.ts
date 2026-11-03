import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import {
  checkRecordValues,
  type AgentField,
  type AgentNewField,
  type Checked,
  type CollectionField,
  type NewCollectionField,
  type RecordValues,
} from "./collectionDomain"

/**
 * Rules for record and artifact references. A reference must point into the
 * same workspace when it is written, and the recordReferences and
 * artifactReferences tables let a delete find the records that point to its
 * target. convex/lib/records.ts keeps those tables in step with each write.
 */

const invalid = (message: string): Checked<never> => ({ ok: false, message })

/** Finds the target collection of a record reference field. */
async function resolveTarget(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  fieldId: string,
  rawCollectionId: string
): Promise<Checked<Id<"collections">>> {
  const collectionId = ctx.db.normalizeId("collections", rawCollectionId)
  const target = collectionId && (await ctx.db.get(collectionId))
  if (!target || target.workspaceId !== workspaceId)
    return invalid(
      `Field "${fieldId}" references a collection that is not in this workspace`
    )
  return { ok: true, value: target._id }
}

/** Resolves the target of a new field when it is a record reference. */
export async function resolveNewField(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  field: AgentNewField
): Promise<Checked<NewCollectionField>> {
  if (field.type !== "recordReference") return { ok: true, value: field }
  const target = await resolveTarget(
    ctx,
    workspaceId,
    field.id,
    field.collectionId
  )
  if (!target.ok) return target
  return { ok: true, value: { ...field, collectionId: target.value } }
}

/** Resolves the target of each record reference field. */
export async function resolveFields(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  fields: ReadonlyArray<AgentField>
): Promise<Checked<CollectionField[]>> {
  const resolved: CollectionField[] = []
  for (const field of fields) {
    if (field.type !== "recordReference") {
      resolved.push(field)
      continue
    }
    const target = await resolveTarget(
      ctx,
      workspaceId,
      field.id,
      field.collectionId
    )
    if (!target.ok) return target
    resolved.push({ ...field, collectionId: target.value })
  }
  return { ok: true, value: resolved }
}

/**
 * Checks `values` with the domain rules, then checks that each reference
 * points to a record of the field's collection, or to an artifact of the
 * collection's workspace. Every record write path calls this first.
 */
export async function checkRecord(
  ctx: QueryCtx,
  collection: Doc<"collections">,
  values: RecordValues
): Promise<Checked<RecordValues>> {
  const checked = checkRecordValues(collection.definition.fields, values)
  if (!checked.ok) return checked
  for (const field of collection.definition.fields) {
    const value = values[field.id]
    if (value === undefined || Array.isArray(value)) continue
    if (field.type === "recordReference") {
      const id = ctx.db.normalizeId("collectionRecords", String(value))
      const record = id && (await ctx.db.get(id))
      if (!record || record.collectionId !== field.collectionId)
        return invalid(
          `Field "${field.id}" references a record that is not in collection ${field.collectionId}`
        )
    } else if (field.type === "artifactReference") {
      const id = ctx.db.normalizeId("artifacts", String(value))
      const artifact = id && (await ctx.db.get(id))
      if (!artifact || artifact.workspaceId !== collection.workspaceId)
        return invalid(
          `Field "${field.id}" references an artifact that is not in this workspace`
        )
    }
  }
  return checked
}

/**
 * Replaces the stored references of a record with the ones in `values`.
 * Callers check the values with `checkRecord` first.
 */
export async function replaceReferences(
  ctx: MutationCtx,
  collection: Doc<"collections">,
  recordId: Id<"collectionRecords">,
  values: RecordValues
) {
  await removeReferences(ctx, recordId)
  for (const field of collection.definition.fields) {
    const value = values[field.id]
    if (value === undefined || Array.isArray(value)) continue
    if (field.type === "recordReference") {
      const targetRecordId = ctx.db.normalizeId(
        "collectionRecords",
        String(value)
      )
      if (targetRecordId)
        await ctx.db.insert("recordReferences", {
          recordId,
          fieldId: field.id,
          targetRecordId,
        })
    } else if (field.type === "artifactReference") {
      const artifactId = ctx.db.normalizeId("artifacts", String(value))
      if (artifactId)
        await ctx.db.insert("artifactReferences", {
          recordId,
          fieldId: field.id,
          artifactId,
        })
    }
  }
}

/** Removes the stored references of `recordId`. */
export async function removeReferences(
  ctx: MutationCtx,
  recordId: Id<"collectionRecords">
) {
  for await (const row of ctx.db
    .query("recordReferences")
    .withIndex("by_recordId", (q) => q.eq("recordId", recordId)))
    await ctx.db.delete(row._id)
  for await (const row of ctx.db
    .query("artifactReferences")
    .withIndex("by_recordId", (q) => q.eq("recordId", recordId)))
    await ctx.db.delete(row._id)
}

/**
 * Another record that references `recordId`, or null. A record that only
 * references itself can still be deleted.
 */
export async function referencingRecord(
  ctx: QueryCtx,
  recordId: Id<"collectionRecords">
): Promise<Id<"collectionRecords"> | null> {
  // Self references are at most one per field, so this scan stays small.
  for await (const row of ctx.db
    .query("recordReferences")
    .withIndex("by_targetRecordId", (q) => q.eq("targetRecordId", recordId)))
    if (row.recordId !== recordId) return row.recordId
  return null
}

/** A record that references `artifactId`, or null. */
export async function referencingArtifact(
  ctx: QueryCtx,
  artifactId: Id<"artifacts">
): Promise<Id<"collectionRecords"> | null> {
  const row = await ctx.db
    .query("artifactReferences")
    .withIndex("by_artifactId", (q) => q.eq("artifactId", artifactId))
    .first()
  return row?.recordId ?? null
}
