import type { PaginationOptions, PaginationResult } from "convex/server"
import { compareValues, v, type Infer } from "convex/values"
import type { Doc } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import {
  indexValueValidator,
  isIndexableType,
  checkRecordValues,
  type Checked,
  type CollectionField,
  type IndexValue,
  type RecordValues,
} from "./collectionDomain"

/**
 * Filtered and sorted record reads over one indexed field. A query reads one
 * range of the recordIndexEntries index, so its cost depends on the page
 * size, not on the size of the collection. Records with no value for the
 * field are not in the results.
 *
 * `where: { in }` and `filters` are checked after the index read, on the
 * entries of one page. So a page can have fewer results than its size, or
 * none, before the last page. Only `isDone` tells that no records remain.
 */

/** The most values of one `in` list. */
export const MAX_IN_VALUES = 20
/** The most residual filters of one query. */
export const MAX_FILTERS = 5
/** The most fields of one selection; a collection has at most 50 fields. */
const MAX_SELECT = 50

const boundValidator = v.object({
  value: indexValueValidator,
  inclusive: v.boolean(),
})

/**
 * A condition on one field of a record (indexed or not), checked after the
 * index read. A record with no value for the field matches no filter. On a
 * multi-select field, "eq" and "in" match a record that has the option (any
 * of the options), and "neq" matches a record that does not have it.
 */
const residualFilterValidator = v.union(
  v.object({
    fieldId: v.string(),
    op: v.union(
      v.literal("eq"),
      v.literal("neq"),
      v.literal("lt"),
      v.literal("lte"),
      v.literal("gt"),
      v.literal("gte")
    ),
    value: indexValueValidator,
  }),
  v.object({
    fieldId: v.string(),
    op: v.literal("in"),
    values: v.array(indexValueValidator),
  })
)

export type ResidualFilter = Infer<typeof residualFilterValidator>

/** Field types with a meaningful order, so range filters apply to them. */
const ORDERED_TYPES: ReadonlySet<CollectionField["type"]> = new Set([
  "text",
  "number",
  "integer",
  "timestamp",
  "date",
])

export const recordQueryValidator = v.object({
  /** An indexed field of the collection. */
  fieldId: v.string(),
  order: v.union(v.literal("asc"), v.literal("desc")),
  /** No `where` returns every record that has a value for the field. */
  where: v.optional(
    v.union(
      v.object({ eq: indexValueValidator }),
      /** 1 to MAX_IN_VALUES values; not for a multi-select field. */
      v.object({ in: v.array(indexValueValidator) }),
      v.object({
        lower: v.optional(boundValidator),
        upper: v.optional(boundValidator),
      })
    )
  ),
  /** At most MAX_FILTERS; a record must match all of them. */
  filters: v.optional(v.array(residualFilterValidator)),
  /**
   * The fields that results contain, in this order: 1 to 50 different
   * fields. No `select` returns every field. Filters can use other fields.
   */
  select: v.optional(v.array(v.string())),
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
  if (
    where !== undefined &&
    "in" in where &&
    (where.in.length < 1 || where.in.length > MAX_IN_VALUES)
  )
    return invalid(`An "in" list has 1 to ${MAX_IN_VALUES} values`)
  const values: IndexValue[] =
    where === undefined
      ? []
      : "eq" in where
        ? [where.eq]
        : "in" in where
          ? where.in
          : [where.lower?.value, where.upper?.value].filter(
              (value) => value !== undefined
            )
  for (const value of values) {
    const checked = checkValue(field, value)
    if (!checked.ok) return checked
  }
  const filters = query.filters ?? []
  if (filters.length > MAX_FILTERS)
    return invalid(`A query has at most ${MAX_FILTERS} filters`)
  for (const filter of filters) {
    const checked = checkFilter(fields, filter)
    if (!checked.ok) return checked
  }
  if (query.select !== undefined) {
    const checked = checkSelect(fields, query.select)
    if (!checked.ok) return checked
  }
  return { ok: true, value: query }
}

function checkSelect(
  fields: ReadonlyArray<CollectionField>,
  select: ReadonlyArray<string>
): Checked<null> {
  if (select.length < 1 || select.length > MAX_SELECT)
    return invalid(`A selection has 1 to ${MAX_SELECT} fields`)
  if (new Set(select).size !== select.length)
    return invalid("A selection lists each field once")
  const unknown = select.find((id) => !fields.some((f) => f.id === id))
  return unknown === undefined
    ? { ok: true, value: null }
    : invalid(
        `Unknown selected field "${unknown}". Fields: ${fields.map((f) => f.id).join(", ")}`
      )
}

/** The fields of the results of a checked query, in their order. */
export function selectedFields(
  fields: ReadonlyArray<CollectionField>,
  query: RecordQuery
): CollectionField[] {
  const { select } = query
  if (select === undefined) return [...fields]
  return select.flatMap((id) => fields.filter((f) => f.id === id))
}

/** The values of `values` for the selected fields only. */
function selectValues(
  values: RecordValues,
  select: ReadonlyArray<string> | undefined
): RecordValues {
  if (select === undefined) return values
  const selected: RecordValues = {}
  for (const id of select) {
    const value = values[id]
    if (value !== undefined) selected[id] = value
  }
  return selected
}

/** Checks that `value` is a valid value of `field` (an option of a choice). */
function checkValue(field: CollectionField, value: IndexValue): Checked<null> {
  const checked = checkRecordValues([field], {
    [field.id]:
      field.type === "multiSelect" && typeof value === "string"
        ? [value]
        : value,
  })
  return checked.ok ? { ok: true, value: null } : checked
}

function checkFilter(
  fields: ReadonlyArray<CollectionField>,
  filter: ResidualFilter
): Checked<null> {
  const field = fields.find((f) => f.id === filter.fieldId)
  if (!field)
    return invalid(
      `Unknown filter field "${filter.fieldId}". Fields: ${fields.map((f) => f.id).join(", ")}`
    )
  if (!isIndexableType(field.type))
    return invalid(`Field "${field.id}" (${field.type}) takes no filters`)
  if (filter.op === "in") {
    if (filter.values.length < 1 || filter.values.length > MAX_IN_VALUES)
      return invalid(`An "in" filter has 1 to ${MAX_IN_VALUES} values`)
    for (const value of filter.values) {
      const checked = checkValue(field, value)
      if (!checked.ok) return checked
    }
    return { ok: true, value: null }
  }
  if (
    filter.op !== "eq" &&
    filter.op !== "neq" &&
    !ORDERED_TYPES.has(field.type)
  )
    return invalid(
      `Field "${field.id}" (${field.type}) takes only eq, neq and in filters`
    )
  return checkValue(field, filter.value)
}

/**
 * True when `values` match `filter`. Values compare in the index order of
 * Convex, and a value of another type never matches.
 */
function matchesFilter(filter: ResidualFilter, values: RecordValues): boolean {
  const value = values[filter.fieldId]
  if (value === undefined) return false
  const wanted = filter.op === "in" ? filter.values : [filter.value]
  if (Array.isArray(value)) {
    const has = wanted.some((option) => value.includes(String(option)))
    return filter.op === "neq" ? !has : has
  }
  if (typeof value !== typeof wanted[0]) return false
  if (filter.op === "in")
    return wanted.some((option) => compareValues(value, option) === 0)
  const order = compareValues(value, filter.value)
  switch (filter.op) {
    case "eq":
      return order === 0
    case "neq":
      return order !== 0
    case "lt":
      return order < 0
    case "lte":
      return order <= 0
    case "gt":
      return order > 0
    case "gte":
      return order >= 0
  }
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
  const filters = checked.value.filters ?? []
  // An `in` list reads the range from its least to its greatest value.
  const inValues =
    where !== undefined && "in" in where
      ? [...where.in].sort(compareValues)
      : undefined
  const entries = await ctx.db
    .query("recordIndexEntries")
    .withIndex("by_collectionId_and_fieldId_and_value", (q) => {
      const field = q.eq("collectionId", collection._id).eq("fieldId", fieldId)
      if (where === undefined) return field
      if ("eq" in where) return field.eq("value", where.eq)
      if ("in" in where) {
        if (inValues === undefined) return field
        const least = inValues[0]
        const greatest = inValues[inValues.length - 1]
        if (least === undefined || greatest === undefined) return field
        return field.gte("value", least).lte("value", greatest)
      }
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
    if (
      inValues !== undefined &&
      !inValues.some((value) => compareValues(value, entry.value) === 0)
    )
      continue
    const record = await ctx.db.get(entry.recordId)
    // The write path deletes entries with their record; skip a stale one.
    if (!record) continue
    if (filters.every((filter) => matchesFilter(filter, record.values)))
      page.push({
        ...record,
        values: selectValues(record.values, checked.value.select),
      })
  }
  return { ok: true, value: { ...entries, page } }
}
