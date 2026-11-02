import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { indexEntries, type RecordValues } from "./collectionDomain"

/**
 * The only write path for records. Each function keeps the record's index
 * entries (the recordIndexEntries table) in step with its values. Callers
 * check access and validate `values` first.
 */

async function replaceIndexEntries(
  ctx: MutationCtx,
  collection: Doc<"collections">,
  recordId: Id<"collectionRecords">,
  values: RecordValues
) {
  await removeIndexEntries(ctx, recordId)
  for (const entry of indexEntries(collection.definition.fields, values))
    await ctx.db.insert("recordIndexEntries", {
      collectionId: collection._id,
      recordId,
      ...entry,
    })
}

async function removeIndexEntries(
  ctx: MutationCtx,
  recordId: Id<"collectionRecords">
) {
  const entries = await ctx.db
    .query("recordIndexEntries")
    .withIndex("by_recordId", (q) => q.eq("recordId", recordId))
    .collect()
  for (const entry of entries) await ctx.db.delete(entry._id)
}

export async function insertRecord(
  ctx: MutationCtx,
  collection: Doc<"collections">,
  values: RecordValues,
  idempotencyKey?: string
) {
  const recordId = await ctx.db.insert("collectionRecords", {
    collectionId: collection._id,
    schemaVersion: collection.definition.version,
    revision: 1,
    values,
    idempotencyKey,
  })
  await replaceIndexEntries(ctx, collection, recordId, values)
  return recordId
}

/** Replaces the values and returns the new revision. */
export async function replaceRecordValues(
  ctx: MutationCtx,
  collection: Doc<"collections">,
  record: Doc<"collectionRecords">,
  values: RecordValues
) {
  const revision = record.revision + 1
  await ctx.db.patch(record._id, {
    values,
    revision,
    schemaVersion: collection.definition.version,
  })
  await replaceIndexEntries(ctx, collection, record._id, values)
  return revision
}

export async function deleteRecord(
  ctx: MutationCtx,
  recordId: Id<"collectionRecords">
) {
  await removeIndexEntries(ctx, recordId)
  await ctx.db.delete(recordId)
}
