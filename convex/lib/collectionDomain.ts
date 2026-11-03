import { v, type Infer } from "convex/values"

/**
 * Rules for runtime-defined collections and their records. Both the signed-in
 * app (convex/workspaces.ts) and the agent API (convex/agentGrants.ts) use
 * these, so a record is valid by the same rules on every path.
 */

export const collectionFieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  type: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("integer"),
    v.literal("currency"),
    v.literal("boolean"),
    /** Integer milliseconds since 1970-01-01T00:00:00Z. */
    v.literal("timestamp"),
    /** A calendar date with no time zone, as "YYYY-MM-DD". */
    v.literal("date")
  ),
  /**
   * When true, a record may leave this field out. When absent, every record
   * must have a value. A field added after creation is always optional,
   * because the records that exist already have no value for it.
   */
  optional: v.optional(v.literal(true)),
  /**
   * When true, records can be filtered and sorted by this field. Each record
   * keeps one index entry per indexed field that has a value. Indexed text
   * values must be short.
   */
  indexed: v.optional(v.literal(true)),
})

/**
 * A collection's fields. `version` starts at 1 and increases by 1 for each
 * schema change, so a record's `schemaVersion` tells which fields existed
 * when it was last written.
 */
export const collectionDefinitionValidator = v.object({
  version: v.number(),
  fields: v.array(collectionFieldValidator),
})

export const recordValueValidator = v.union(v.string(), v.number(), v.boolean())

export const recordValuesValidator = v.record(v.string(), recordValueValidator)

/** A stored record as queries return it. */
export const collectionRecordValidator = v.object({
  _id: v.id("collectionRecords"),
  _creationTime: v.number(),
  collectionId: v.id("collections"),
  schemaVersion: v.number(),
  revision: v.number(),
  values: recordValuesValidator,
  idempotencyKey: v.optional(v.string()),
})

/** Every field type; the `Record` type makes the list complete. */
const FIELD_TYPES: Record<CollectionField["type"], true> = {
  text: true,
  number: true,
  boolean: true,
  integer: true,
  currency: true,
  timestamp: true,
  date: true,
}

/** Shared by HTTP parsers and human forms; field kinds keep scalar wire values. */
export function isFieldType(value: unknown): value is CollectionField["type"] {
  return typeof value === "string" && Object.hasOwn(FIELD_TYPES, value)
}

export function isNumericField(type: CollectionField["type"]): boolean {
  return type === "number" || type === "integer"
}

export type CollectionField = Infer<typeof collectionFieldValidator>
export type CollectionDefinition = Infer<typeof collectionDefinitionValidator>
export type RecordValue = Infer<typeof recordValueValidator>
export type RecordValues = Infer<typeof recordValuesValidator>

const MAX_NAME_LENGTH = 100
const MAX_FIELDS = 50
export const MAX_INDEXED_FIELDS = 5
export const MAX_INDEXED_TEXT_LENGTH = 200
const MAX_TEXT_LENGTH = 10_000
const MAX_RECORD_TEXT = 50_000
const FIELD_ID = /^[a-z][a-z0-9_]{0,63}$/
/** The range of a JavaScript `Date`, in milliseconds from the epoch. */
const MAX_TIMESTAMP = 8_640_000_000_000_000

/** True for a real calendar date written as "YYYY-MM-DD". */
export function isDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [match[1], match[2], match[3]].map(Number)
  // setUTCFullYear keeps years 0 to 99; Date.UTC maps them to 1900 to 1999.
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/** A checked value, or a message that says what to fix. */
export type Checked<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly message: string }

const invalid = (message: string): Checked<never> => ({ ok: false, message })

/** Trims the label and checks the label length and the ID format. */
function checkField(field: CollectionField): Checked<CollectionField> {
  const label = field.label.trim()
  if (!label || label.length > MAX_NAME_LENGTH)
    return invalid(
      `Field label must be between 1 and ${MAX_NAME_LENGTH} characters`
    )
  if (!FIELD_ID.test(field.id))
    return invalid(
      "Field IDs must use lowercase letters, numbers, or underscores, and start with a letter"
    )
  return { ok: true, value: { ...field, label } }
}

/**
 * Trims the name and labels, and checks lengths and unique field IDs.
 * `maxIndexed` is the workspace budget for new collections; it defaults to
 * the platform ceiling.
 */
export function checkCollection(
  name: string,
  fields: ReadonlyArray<CollectionField>,
  maxIndexed = MAX_INDEXED_FIELDS
): Checked<{ name: string; fields: CollectionField[] }> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH)
    return invalid(`Name must be between 1 and ${MAX_NAME_LENGTH} characters`)
  if (fields.length < 1 || fields.length > MAX_FIELDS)
    return invalid(`Add 1 to ${MAX_FIELDS} fields`)
  const ids = new Set<string>()
  const checked: CollectionField[] = []
  for (const field of fields) {
    const result = checkField(field)
    if (!result.ok) return result
    if (ids.has(field.id))
      return invalid(`Field ID "${field.id}" is used twice`)
    ids.add(field.id)
    checked.push(result.value)
  }
  if (checked.filter((field) => field.indexed).length > maxIndexed)
    return invalid(`Index at most ${maxIndexed} fields`)
  return { ok: true, value: { name: trimmed, fields: checked } }
}

/**
 * Adds one field to a definition and increases its version. The new field is
 * optional, so the records that exist stay valid without a migration.
 * `maxIndexed` is the workspace budget for indexed fields.
 */
export function addField(
  definition: CollectionDefinition,
  field: Omit<CollectionField, "optional">,
  maxIndexed = MAX_INDEXED_FIELDS
): Checked<CollectionDefinition> {
  if (definition.fields.length >= MAX_FIELDS)
    return invalid(`A collection can have at most ${MAX_FIELDS} fields`)
  const result = checkField(field)
  if (!result.ok) return result
  if (definition.fields.some((existing) => existing.id === field.id))
    return invalid(`Field ID "${field.id}" is already used`)
  if (
    field.indexed &&
    definition.fields.filter((existing) => existing.indexed).length >=
      maxIndexed
  )
    return invalid(`A collection can index at most ${maxIndexed} fields`)
  return {
    ok: true,
    value: {
      version: definition.version + 1,
      fields: [...definition.fields, { ...result.value, optional: true }],
    },
  }
}

/**
 * Checks that `values` has a value of the right type for each required field,
 * and no value for a field that does not exist. Optional fields may be left
 * out.
 */
export function checkRecordValues(
  fields: ReadonlyArray<CollectionField>,
  values: RecordValues
): Checked<RecordValues> {
  const ids = new Set(fields.map((field) => field.id))
  for (const key of Object.keys(values))
    if (!ids.has(key))
      return invalid(
        `Unknown field "${key}". Fields: ${fields.map((f) => f.id).join(", ")}`
      )
  let textLength = 0
  for (const field of fields) {
    if (!Object.hasOwn(values, field.id)) {
      if (field.optional) continue
      return invalid(`Missing value for field "${field.id}"`)
    }
    const value = values[field.id]
    if (field.type === "text") {
      if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH)
        return invalid(
          `Field "${field.id}" must be text of at most ${MAX_TEXT_LENGTH} characters`
        )
      if (field.indexed && value.length > MAX_INDEXED_TEXT_LENGTH)
        return invalid(
          `Field "${field.id}" is indexed, so its text must be at most ${MAX_INDEXED_TEXT_LENGTH} characters`
        )
      textLength += value.length
    } else if (field.type === "currency") {
      if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value))
        return invalid(
          `Field "${field.id}" must be a three-letter uppercase currency code`
        )
      textLength += value.length
    } else if (field.type === "integer") {
      if (typeof value !== "number" || !Number.isSafeInteger(value))
        return invalid(
          `Field "${field.id}" must be a safe integer (minor units for money)`
        )
    } else if (field.type === "timestamp") {
      if (
        typeof value !== "number" ||
        !Number.isSafeInteger(value) ||
        Math.abs(value) > MAX_TIMESTAMP
      )
        return invalid(
          `Field "${field.id}" must be a timestamp: integer milliseconds since 1970-01-01T00:00:00Z`
        )
    } else if (field.type === "date") {
      if (typeof value !== "string" || !isDateOnly(value))
        return invalid(
          `Field "${field.id}" must be a calendar date as YYYY-MM-DD`
        )
      textLength += value.length
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value))
        return invalid(`Field "${field.id}" must be a finite number`)
    } else if (typeof value !== "boolean")
      return invalid(`Field "${field.id}" must be true or false`)
  }
  if (textLength > MAX_RECORD_TEXT)
    return invalid(
      `Text in one record must total at most ${MAX_RECORD_TEXT} characters`
    )
  return { ok: true, value: values }
}

/** The index entries of a record: one per indexed field that has a value. */
export function indexEntries(
  fields: ReadonlyArray<CollectionField>,
  values: RecordValues
): Array<{ fieldId: string; value: RecordValue }> {
  return fields.flatMap((field) =>
    field.indexed && Object.hasOwn(values, field.id)
      ? [{ fieldId: field.id, value: values[field.id] }]
      : []
  )
}
