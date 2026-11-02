import type { PaginationOptions, PaginationResult } from "convex/server"
import { v, type Infer } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import {
  recordValueValidator,
  type Checked,
  type CollectionField,
  type RecordValue,
} from "./collectionDomain"

/**
 * Filtered and sorted record reads over one indexed field. A query reads one
 * range of the recordIndexEntries index, so its cost depends on the page
 * size, not on the size of the collection. Records with no value for the
 * field are not in the results.
 */

const boundValidator = v.object({
  value: recordValueValidator,
  inclusive: v.boolean(),
})

export const recordQueryValidator = v.object({
  /** An indexed field of the collection. */
  fieldId: v.string(),
  order: v.union(v.literal("asc"), v.literal("desc")),
  /** No `where` returns every record that has a value for the field. */
  where: v.optional(
    v.union(
      v.object({ eq: recordValueValidator }),
      v.object({
        lower: v.optional(boundValidator),
        upper: v.optional(boundValidator),
      })
    )
  ),
})

export type RecordQuery = Infer<typeof recordQueryValidator>

const TYPE_OF: Record<CollectionField["type"], string> = {
  text: "string",
  number: "number",
  boolean: "boolean",
}

const invalid = (message: string): Checked<never> => ({ ok: false, message })

/** Checks that the field is indexed and every value has the field's type. */
function checkQuery(
  fields: ReadonlyArray<CollectionField>,
  query: RecordQuery
): Checked<RecordQuery> {
  const field = fields.find((f) => f.id === query.fieldId)
  if (!field) return invalid(`Unknown field "${query.fieldId}"`)
  if (!field.indexed)
    return invalid(
      `Field "${field.id}" is not indexed. Indexed fields: ${
        fields
          .filter((f) => f.indexed)
          .map((f) => f.id)
          .join(", ") || "none"
      }`
    )
  const { where } = query
  const values: RecordValue[] =
    where === undefined
      ? []
      : "eq" in where
        ? [where.eq]
        : [where.lower?.value, where.upper?.value].filter(
            (value) => value !== undefined
          )
  if (values.some((value) => typeof value !== TYPE_OF[field.type]))
    return invalid(`Values for field "${field.id}" must be ${field.type}`)
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
