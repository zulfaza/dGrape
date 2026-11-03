import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import {
  checkCollection,
  isChoiceField,
  type CollectionDefinition,
  type CollectionField,
} from "./collectionDomain"
import { EMPTY_RECORD_COUNT } from "./recordCounts"

/**
 * True when every value of `previous` is valid for `next`: the same type,
 * and for select fields, every previous option is still there.
 */
function keepsValues(previous: CollectionField, next: CollectionField) {
  if (next.type !== previous.type) return false
  if (!isChoiceField(previous)) return true
  return (
    isChoiceField(next) &&
    previous.options.every((option) => next.options.includes(option))
  )
}

/** New collections preserve their initial definition in the same transaction. */
export async function createVersionedCollection(
  ctx: MutationCtx,
  collection: Omit<Doc<"collections">, "_id" | "_creationTime">
) {
  const collectionId = await ctx.db.insert("collections", {
    ...collection,
    recordCount: EMPTY_RECORD_COUNT,
  })
  await ctx.db.insert("collectionSchemaVersions", {
    collectionId,
    definition: collection.definition,
  })
  return collectionId
}

/**
 * Only label changes, new select options, and optional additions are
 * compatible. Changes to existing
 * IDs, types, requiredness, or indexes must use a separately validated migration.
 * Callers authorize access before invoking this transaction-local helper.
 */
export async function publishCompatibleSchema(
  ctx: MutationCtx,
  collection: Doc<"collections">,
  definition: CollectionDefinition
) {
  // Re-read the active definition so stale transaction-local callers cannot
  // overwrite a definition that another operation in this transaction changed.
  const current = await ctx.db.get(collection._id)
  if (!current || current.definition.version !== collection.definition.version)
    throw new Error("Schema revision conflict")
  if (
    !Number.isSafeInteger(definition.version) ||
    definition.version !== current.definition.version + 1
  )
    throw new Error("Schema revision conflict")
  const checked = checkCollection(current.name, definition.fields)
  if (!checked.ok) throw new Error(checked.message)
  for (const field of current.definition.fields) {
    const next = checked.value.fields.find(
      (candidate) => candidate.id === field.id
    )
    if (
      !next ||
      !keepsValues(field, next) ||
      next.optional !== field.optional ||
      next.indexed !== field.indexed
    )
      throw new Error("Incompatible schema change requires migration")
  }
  for (const field of checked.value.fields)
    if (
      !current.definition.fields.some((previous) => previous.id === field.id) &&
      !field.optional
    )
      throw new Error("New fields must be optional")

  const previous = await ctx.db
    .query("collectionSchemaVersions")
    .withIndex("by_collectionId_and_version", (q) =>
      q
        .eq("collectionId", current._id)
        .eq("definition.version", current.definition.version)
    )
    .unique()
  // Legacy collections get an honest baseline at the first schema edit; older
  // definitions that were never stored cannot be reconstructed.
  if (!previous)
    await ctx.db.insert("collectionSchemaVersions", {
      collectionId: current._id,
      definition: current.definition,
    })
  await ctx.db.insert("collectionSchemaVersions", {
    collectionId: current._id,
    definition: { version: definition.version, fields: checked.value.fields },
  })
  await ctx.db.patch(current._id, {
    definition: { version: definition.version, fields: checked.value.fields },
  })
}
