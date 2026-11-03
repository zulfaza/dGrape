import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { indexEntries, type RecordValues } from "./collectionDomain"
import {
  countAfterDelete,
  countAfterInsert,
  recordBudgetProblem,
  startRecordCount,
  type RecordCount,
} from "./recordCounts"
import {
  referencingRecord,
  removeReferences,
  replaceReferences,
} from "./references"

/**
 * The only write path for records. Each function keeps the record's index
 * entries (the recordIndexEntries table), references (see
 * convex/lib/references.ts), and the collection's record count in step with
 * its values. Callers check access and validate `values` with `checkRecord`
 * first.
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
  // Re-read: a caller that inserts several records passes the same document.
  const current = await ctx.db.get(collection._id)
  if (!current) throw new Error("Collection missing")
  const problem = await recordBudgetProblem(ctx, current)
  if (problem) throw new Error(problem)
  const recordId = await ctx.db.insert("collectionRecords", {
    collectionId: collection._id,
    schemaVersion: collection.definition.version,
    revision: 1,
    values,
    idempotencyKey,
  })
  const record = await ctx.db.get(recordId)
  if (!record) throw new Error("Record missing")
  await advanceDataRevision(ctx, collection._id, (state) =>
    countAfterInsert(state, record)
  )
  await replaceIndexEntries(ctx, collection, recordId, values)
  await replaceReferences(ctx, collection, recordId, values)
  return recordId
}

/** Replaces the values and returns the new revision. */
export async function replaceRecordValues(
  ctx: MutationCtx,
  collection: Doc<"collections">,
  record: Doc<"collectionRecords">,
  values: RecordValues
) {
  await advanceDataRevision(ctx, collection._id)
  const revision = record.revision + 1
  await ctx.db.patch(record._id, {
    values,
    revision,
    schemaVersion: collection.definition.version,
  })
  await replaceIndexEntries(ctx, collection, record._id, values)
  await replaceReferences(ctx, collection, record._id, values)
  return revision
}

/**
 * Deletes a record, unless another record references it. Returns the ID of
 * such a record, or null when the record is deleted.
 */
export async function deleteRecord(
  ctx: MutationCtx,
  recordId: Id<"collectionRecords">
): Promise<Id<"collectionRecords"> | null> {
  const record = await ctx.db.get(recordId)
  if (!record) throw new Error("Record missing")
  const collection = await ctx.db.get(record.collectionId)
  if (!collection) throw new Error("Collection missing")
  const referencedBy = await referencingRecord(ctx, recordId)
  if (referencedBy) return referencedBy
  await advanceDataRevision(ctx, collection._id, (state) =>
    countAfterDelete(state, record)
  )
  await removeIndexEntries(ctx, recordId)
  await removeReferences(ctx, recordId)
  for await (const identity of ctx.db
    .query("recordIdentities")
    .withIndex("by_recordId", (q) => q.eq("recordId", recordId)))
    await ctx.db.delete(identity._id)
  await ctx.db.delete(recordId)
  return null
}

/**
 * Each record write starts the count if the collection has none. `count` is
 * given when the write adds or removes a record.
 */
async function advanceDataRevision(
  ctx: MutationCtx,
  id: Id<"collections">,
  count: (state: RecordCount) => RecordCount = (state) => state
) {
  const collection = await ctx.db.get(id)
  if (!collection) throw new Error("Collection missing")
  const state = collection.recordCount ?? (await startRecordCount(ctx, id))
  await ctx.db.patch(id, {
    dataRevision: (collection.dataRevision ?? 0) + 1,
    recordCount: count(state),
  })
}
