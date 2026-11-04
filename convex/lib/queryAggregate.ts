import { compareValues, v, type Infer } from "convex/values"
import type {
  Checked,
  CollectionField,
  IndexValue,
  RecordValues,
} from "./collectionDomain"
import { checkQuery, recordQueryValidator, selectedFields } from "./recordQuery"

/**
 * Bounded aggregates of a saved query: count, sum, min, max and average,
 * optionally grouped by one field, with dates and timestamps in UTC day,
 * week (from Monday), month or year buckets.
 *
 * An aggregate reads the records of one bounded index page (the workspace's
 * query row budget). If more records match, it does not return a partial
 * total: it fails with QueryTooExpensive (convex/lib/queryErrors.ts), and the
 * caller materializes the result with a recipe instead (ADR 0004).
 */

/** The most measures of one aggregate. */
const MAX_MEASURES = 5

const bucketValidator = v.union(
  v.literal("day"),
  v.literal("week"),
  v.literal("month"),
  v.literal("year")
)

const measureValidator = v.union(
  v.object({ op: v.literal("count") }),
  v.object({
    op: v.union(
      v.literal("sum"),
      v.literal("min"),
      v.literal("max"),
      v.literal("average")
    ),
    fieldId: v.string(),
  })
)

export const aggregateValidator = v.object({
  /**
   * The field whose values make the groups; not a multi-select field. A
   * `bucket` applies only to a date or timestamp field. Records with no
   * value for the field are in no group. No `groupBy` gives one row.
   */
  groupBy: v.optional(
    v.object({ fieldId: v.string(), bucket: v.optional(bucketValidator) })
  ),
  /** 1 to MAX_MEASURES different measures. */
  measures: v.array(measureValidator),
})

/**
 * A saved query: a record query, optionally with an aggregate. An aggregate
 * query has no `select`; its result fields are the group and the measures.
 */
export const savedQueryValidator = recordQueryValidator.extend({
  aggregate: v.optional(aggregateValidator),
})

export type Aggregate = Infer<typeof aggregateValidator>
export type SavedQuery = Infer<typeof savedQueryValidator>
type Measure = Aggregate["measures"][number]
type Bucket = Infer<typeof bucketValidator>

const invalid = (message: string): Checked<never> => ({ ok: false, message })

/** Checks the record query and its aggregate against the fields. */
export function checkSavedQuery(
  fields: ReadonlyArray<CollectionField>,
  query: SavedQuery
): Checked<SavedQuery> {
  const checked = checkQuery(fields, query)
  if (!checked.ok) return checked
  const { aggregate } = query
  if (aggregate === undefined) return { ok: true, value: query }
  if (query.select !== undefined)
    return invalid("An aggregate query has no select; it returns its measures")
  const output = aggregateFields(fields, aggregate)
  return output.ok ? { ok: true, value: query } : output
}

/** The result fields of a checked saved query, in their order. */
export function savedQueryFields(
  fields: ReadonlyArray<CollectionField>,
  query: SavedQuery
): Checked<CollectionField[]> {
  return query.aggregate === undefined
    ? { ok: true, value: selectedFields(fields, query) }
    : aggregateFields(fields, query.aggregate)
}

/** The id of a measure's result field: "count", or "<op>_<fieldId>". */
function measureId(measure: Measure): string {
  return measure.op === "count" ? "count" : `${measure.op}_${measure.fieldId}`
}

/**
 * The result fields of an aggregate (the group field first, then the
 * measures), or a message when the aggregate does not fit the fields.
 */
export function aggregateFields(
  fields: ReadonlyArray<CollectionField>,
  aggregate: Aggregate
): Checked<CollectionField[]> {
  const output: CollectionField[] = []
  const { groupBy, measures } = aggregate
  if (groupBy !== undefined) {
    const field = fields.find((f) => f.id === groupBy.fieldId)
    if (!field) return invalid(`Unknown group field "${groupBy.fieldId}"`)
    if (field.type === "multiSelect")
      return invalid(`Group field "${field.id}" cannot be a multi-select field`)
    if (
      groupBy.bucket !== undefined &&
      field.type !== "date" &&
      field.type !== "timestamp"
    )
      return invalid(
        `Field "${field.id}" (${field.type}) has no date buckets; only date and timestamp fields do`
      )
    const { indexed: _indexed, optional: _optional, ...group } = field
    output.push(
      groupBy.bucket === undefined
        ? group
        : { ...group, label: `${field.label} (${groupBy.bucket})` }
    )
  }
  if (measures.length < 1 || measures.length > MAX_MEASURES)
    return invalid(`An aggregate has 1 to ${MAX_MEASURES} measures`)
  for (const measure of measures) {
    const id = measureId(measure)
    if (output.some((f) => f.id === id))
      return invalid(`Aggregate result field "${id}" is listed twice`)
    if (measure.op === "count") {
      output.push({ id, label: "Count", type: "integer" })
      continue
    }
    const field = fields.find((f) => f.id === measure.fieldId)
    if (!field) return invalid(`Unknown measure field "${measure.fieldId}"`)
    const numeric = field.type === "number" || field.type === "integer"
    const ordered =
      numeric || field.type === "timestamp" || field.type === "date"
    if (measure.op === "sum" || measure.op === "average") {
      if (!numeric)
        return invalid(
          `${measure.op} needs a number or integer field; "${field.id}" is ${field.type}`
        )
      // A sum of no values is 0; an average of no values has no value.
      output.push(
        measure.op === "sum"
          ? { id, label: `Sum of ${field.label}`, type: "number" }
          : {
              id,
              label: `Average of ${field.label}`,
              type: "number",
              optional: true,
            }
      )
      continue
    }
    if (!ordered)
      return invalid(
        `${measure.op} needs a number, integer, date or timestamp field; "${field.id}" is ${field.type}`
      )
    output.push({
      id,
      label: `${measure.op === "min" ? "Least" : "Greatest"} ${field.label}`,
      type: field.type,
      optional: true,
    })
  }
  return { ok: true, value: output }
}

/** One group of an aggregate result; `key` is unique in the result. */
export type AggregateRow = { key: string; values: RecordValues }

type Accumulator = {
  group: IndexValue | undefined
  count: number
  sums: Map<string, { total: number; n: number }>
  extremes: Map<string, IndexValue>
}

/**
 * Groups `records` and computes the measures. Rows are in the order of the
 * group value, or reversed for "desc". Sum and average skip records with no
 * value; min and max are absent when no record has a value.
 */
export function aggregateRecords(
  aggregate: Aggregate,
  order: "asc" | "desc",
  records: ReadonlyArray<RecordValues>
): AggregateRow[] {
  const { groupBy, measures } = aggregate
  const groups = new Map<string, Accumulator>()
  const groupOf = (group: IndexValue | undefined) => {
    const key = JSON.stringify(group ?? null)
    const found = groups.get(key)
    if (found) return found
    const created: Accumulator = {
      group,
      count: 0,
      sums: new Map(),
      extremes: new Map(),
    }
    groups.set(key, created)
    return created
  }
  if (groupBy === undefined) groupOf(undefined)
  for (const values of records) {
    let group: IndexValue | undefined
    if (groupBy !== undefined) {
      const value = values[groupBy.fieldId]
      if (value === undefined || Array.isArray(value)) continue
      group =
        groupBy.bucket === undefined
          ? value
          : bucketStart(value, groupBy.bucket)
    }
    const accumulator = groupOf(group)
    accumulator.count += 1
    for (const measure of measures) {
      if (measure.op === "count") continue
      const value = values[measure.fieldId]
      if (value === undefined || Array.isArray(value)) continue
      const id = measureId(measure)
      if (measure.op === "sum" || measure.op === "average") {
        if (typeof value !== "number") continue
        const sum = accumulator.sums.get(id) ?? { total: 0, n: 0 }
        accumulator.sums.set(id, { total: sum.total + value, n: sum.n + 1 })
        continue
      }
      const previous = accumulator.extremes.get(id)
      const better =
        previous === undefined ||
        (measure.op === "min"
          ? compareValues(value, previous) < 0
          : compareValues(value, previous) > 0)
      if (better) accumulator.extremes.set(id, value)
    }
  }
  const rows = [...groups.entries()]
    .sort(([, a], [, b]) => compareValues(a.group, b.group))
    .map(([key, accumulator]): AggregateRow => {
      const values: RecordValues = {}
      if (groupBy !== undefined && accumulator.group !== undefined)
        values[groupBy.fieldId] = accumulator.group
      for (const measure of measures) {
        const id = measureId(measure)
        if (measure.op === "count") values[id] = accumulator.count
        else if (measure.op === "sum")
          values[id] = accumulator.sums.get(id)?.total ?? 0
        else if (measure.op === "average") {
          const sum = accumulator.sums.get(id)
          if (sum !== undefined && sum.n > 0) values[id] = sum.total / sum.n
        } else {
          const extreme = accumulator.extremes.get(id)
          if (extreme !== undefined) values[id] = extreme
        }
      }
      return { key, values }
    })
  return order === "desc" ? rows.reverse() : rows
}

/**
 * The start of the UTC bucket of a timestamp (milliseconds) or a date
 * ("YYYY-MM-DD"), in the same form. Weeks start on Monday.
 */
export function bucketStart(
  value: string | number | boolean,
  bucket: Bucket
): IndexValue {
  if (typeof value === "boolean") return value
  const date = new Date(
    typeof value === "number" ? value : `${value}T00:00:00Z`
  )
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  const day = date.getUTCDate()
  const start = new Date(0)
  // setUTCFullYear keeps years 0 to 99; Date.UTC maps them to 1900 to 1999.
  if (bucket === "day") start.setUTCFullYear(year, month, day)
  else if (bucket === "week")
    start.setUTCFullYear(year, month, day - ((date.getUTCDay() + 6) % 7))
  else if (bucket === "month") start.setUTCFullYear(year, month, 1)
  else start.setUTCFullYear(year, 0, 1)
  if (typeof value === "number") return start.getTime()
  return [
    String(start.getUTCFullYear()).padStart(4, "0"),
    String(start.getUTCMonth() + 1).padStart(2, "0"),
    String(start.getUTCDate()).padStart(2, "0"),
  ].join("-")
}
