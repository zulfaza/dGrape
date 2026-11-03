import type { PaginationOptions, PaginationResult } from "convex/server"
import { v, type Infer } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import {
  indexValueValidator,
  checkRecordValues,
  type Checked,
  type CollectionField,
  type IndexValue,
} from "./collectionDomain"

/**
 * Filtered and sorted record reads over one indexed field. A query reads one
 * range of the recordIndexEntries index, so its cost depends on the page
 * size, not on the size of the collection. Records with no value for the
 * field are not in the results.
 */

const boundValidator = v.object({
  value: indexValueValidator,
  inclusive: v.boolean(),
})

export const recordQueryValidator = v.object({
  /** An indexed field of the collection. */
  fieldId: v.string(),
  order: v.union(v.literal("asc"), v.literal("desc")),
  /** No `where` returns every record that has a value for the field. */
  where: v.optional(
    v.union(
      v.object({ eq: indexValueValidator }),
      v.object({
        lower: v.optional(boundValidator),
        upper: v.optional(boundValidator),
      })
    )
  ),
})

export type RecordQuery = Infer<typeof recordQueryValidator>

const invalid = (message: string): Checked<never> => ({ ok: false, message })

/** Checks that the field is indexed and every value has the field's type. */
export function checkQuery(
  fields: ReadonlyArray<CollectionField>,
  query: RecordQuery
): Checked<RecordQuery> {
  const field = fields.find((f) => f.id === query.fieldId)
  if (!field) return invalid(`Unknown field "${query.fieldId}"`)
  if (!field.indexed)
    return invalid(
      `Field "${field.id}" is not indexed. Indexed fields: ${
        fields.flatMap((f) => (f.indexed ? [f.id] : [])).join(", ") || "none"
      }`
    )
  const { where } = query
  // A record has one entry per chosen option, so only an equal match reads
  // each record once.
  if (field.type === "multiSelect" && (where === undefined || !("eq" in where)))
    return invalid(
      `Field "${field.id}" is a multi-select field. Filter it with { eq: option }`
    )
  const values: IndexValue[] =
    where === undefined
      ? []
      : "eq" in where
        ? [where.eq]
        : [where.lower?.value, where.upper?.value].filter(
            (value) => value !== undefined
          )
  for (const value of values) {
    const checked = checkRecordValues([field], {
      [field.id]:
        field.type === "multiSelect" && typeof value === "string"
          ? [value]
          : value,
    })
    if (!checked.ok) return checked
  }
  return { ok: true, value: query }
}

/** Returns one page of records that match `query`, in its order. */
export async function queryRecords(
  ctx: QueryCtx,
  collection: Doc<"collections">,
  query: RecordQuery,
  paginationOpts: PaginationOptions
): Promise<Checked<PaginationResult<Doc<"collectionRecords">>>> {
  const checked = checkQuery(collection.definition.fields, query)
  if (!checked.ok) return checked
  const { fieldId, where, order } = checked.value
  const entries = await ctx.db
    .query("recordIndexEntries")
    .withIndex("by_collectionId_and_fieldId_and_value", (q) => {
      const field = q.eq("collectionId", collection._id).eq("fieldId", fieldId)
      if (where === undefined) return field
      if ("eq" in where) return field.eq("value", where.eq)
      const { lower, upper } = where
      const low =
        lower === undefined
          ? field
          : lower.inclusive
            ? field.gte("value", lower.value)
            : field.gt("value", lower.value)
      if (upper === undefined) return low
      return upper.inclusive
        ? low.lte("value", upper.value)
        : low.lt("value", upper.value)
    })
    .order(order)
    .paginate(paginationOpts)
  const page: Array<Doc<"collectionRecords">> = []
  for (const entry of entries.page) {
    const record = await ctx.db.get(entry.recordId)
    // The write path deletes entries with their record; skip a stale one.
    if (record) page.push(record)
  }
  return { ok: true, value: { ...entries, page } }
}
