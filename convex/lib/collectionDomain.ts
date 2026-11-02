import { v, type Infer } from "convex/values"

/**
 * Rules for runtime-defined collections and their records. Both the signed-in
 * app (convex/workspaces.ts) and the agent API (convex/agentGrants.ts) use
 * these, so a record is valid by the same rules on every path.
 */

export const collectionFieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  type: v.union(v.literal("text"), v.literal("number"), v.literal("boolean")),
})

export const recordValuesValidator = v.record(
  v.string(),
  v.union(v.string(), v.number(), v.boolean())
)

/** A stored record as queries return it. */
export const collectionRecordValidator = v.object({
  _id: v.id("collectionRecords"),
  _creationTime: v.number(),
  collectionId: v.id("collections"),
  schemaVersion: v.literal(1),
  revision: v.number(),
  values: recordValuesValidator,
  idempotencyKey: v.optional(v.string()),
})

export type CollectionField = Infer<typeof collectionFieldValidator>
export type RecordValues = Infer<typeof recordValuesValidator>

const MAX_NAME_LENGTH = 100
const MAX_FIELDS = 50
const MAX_TEXT_LENGTH = 10_000
const MAX_RECORD_TEXT = 50_000
const FIELD_ID = /^[a-z][a-z0-9_]{0,63}$/

/** A checked value, or a message that says what to fix. */
export type Checked<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly message: string }

const invalid = (message: string): Checked<never> => ({ ok: false, message })

/** Trims the name and labels, and checks lengths and unique field IDs. */
export function checkCollection(
  name: string,
  fields: ReadonlyArray<CollectionField>
): Checked<{ name: string; fields: CollectionField[] }> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH)
    return invalid(`Name must be between 1 and ${MAX_NAME_LENGTH} characters`)
  if (fields.length < 1 || fields.length > MAX_FIELDS)
    return invalid(`Add 1 to ${MAX_FIELDS} fields`)
  const ids = new Set<string>()
  const checked: CollectionField[] = []
  for (const field of fields) {
    const label = field.label.trim()
    if (!label || label.length > MAX_NAME_LENGTH)
      return invalid(
        `Field label must be between 1 and ${MAX_NAME_LENGTH} characters`
      )
    if (!FIELD_ID.test(field.id) || ids.has(field.id))
      return invalid(
        "Field IDs must be unique and use lowercase letters, numbers, or underscores"
      )
    ids.add(field.id)
    checked.push({ ...field, label })
  }
  return { ok: true, value: { name: trimmed, fields: checked } }
}

/** Checks that `values` has exactly one value of the right type per field. */
export function checkRecordValues(
  fields: ReadonlyArray<CollectionField>,
  values: RecordValues
): Checked<RecordValues> {
  if (Object.keys(values).length !== fields.length)
    return invalid(
      `Give exactly one value for each field: ${fields.map((f) => f.id).join(", ")}`
    )
  let textLength = 0
  for (const field of fields) {
    if (!Object.hasOwn(values, field.id))
      return invalid(`Missing value for field "${field.id}"`)
    const value = values[field.id]
    if (field.type === "text") {
      if (typeof value !== "string" || value.length > MAX_TEXT_LENGTH)
        return invalid(
          `Field "${field.id}" must be text of at most ${MAX_TEXT_LENGTH} characters`
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
