import { v, type Infer } from "convex/values"

/**
 * Rules for runtime-defined collections and their records. Both the signed-in
 * app (convex/workspaces.ts) and the agent API (convex/agentGrants.ts) use
 * these, so a record is valid by the same rules on every path.
 */

const fieldIdentity = {
  id: v.string(),
  label: v.string(),
  /**
   * When true, records can be filtered and sorted by this field. Each record
   * keeps one index entry per indexed field that has a value (one per chosen
   * option for a multi-select field). Indexed text values must be short.
   */
  indexed: v.optional(v.literal(true)),
}

/** A field whose value is one scalar. */
const scalarFieldValidator = v.object({
  ...fieldIdentity,
  type: v.union(
    v.literal("text"),
    v.literal("number"),
    v.literal("integer"),
    v.literal("currency"),
    v.literal("boolean"),
    /** Integer milliseconds since 1970-01-01T00:00:00Z. */
    v.literal("timestamp"),
    /** A calendar date with no time zone, as "YYYY-MM-DD". */
    v.literal("date"),
    /** The ID of an artifact in the same workspace. */
    v.literal("artifactReference"),
    /**
     * The ID of a workspace secret (secretRefs) in the same workspace. The
     * record keeps only the ID, never the secret. It cannot be indexed, and
     * exports and page blocks leave it out.
     */
    v.literal("secretRef")
  ),
})

/**
 * A field whose value comes from a fixed list of options: one option for
 * "select", a list of different options for "multiSelect".
 */
const choiceFieldValidator = v.object({
  ...fieldIdentity,
  type: v.union(v.literal("select"), v.literal("multiSelect")),
  options: v.array(v.string()),
})

/**
 * A field whose value is the ID of a record in the collection `collectionId`,
 * which is in the same workspace. A referenced record cannot be deleted.
 */
const recordReferenceFieldValidator = v.object({
  ...fieldIdentity,
  type: v.literal("recordReference"),
  collectionId: v.id("collections"),
})

/**
 * A field whose value is a JSON object, nested at most `MAX_OBJECT_DEPTH`
 * levels deep and at most `MAX_OBJECT_LENGTH` characters as JSON. An object
 * field cannot be indexed.
 */
const objectFieldValidator = v.object({
  ...fieldIdentity,
  type: v.literal("object"),
})

/** A field before it is in a collection; `addField` makes it optional. */
export const newCollectionFieldValidator = v.union(
  scalarFieldValidator,
  choiceFieldValidator,
  recordReferenceFieldValidator,
  objectFieldValidator
)

/**
 * When `optional` is true, a record may leave the field out. When absent,
 * every record must have a value. A field added after creation is always
 * optional, because the records that exist already have no value for it.
 */
const requiredness = { optional: v.optional(v.literal(true)) }

export const collectionFieldValidator = v.union(
  scalarFieldValidator.extend(requiredness),
  choiceFieldValidator.extend(requiredness),
  recordReferenceFieldValidator.extend(requiredness),
  objectFieldValidator.extend(requiredness)
)

/**
 * Field shapes as agents send them. The target collection of a record
 * reference is any string until convex/lib/references.ts resolves it.
 */
const agentRecordReferenceFieldValidator = recordReferenceFieldValidator
  .omit("collectionId")
  .extend({ collectionId: v.string() })

export const agentNewFieldValidator = v.union(
  scalarFieldValidator,
  choiceFieldValidator,
  agentRecordReferenceFieldValidator,
  objectFieldValidator
)

export const agentFieldValidator = v.union(
  scalarFieldValidator.extend(requiredness),
  choiceFieldValidator.extend(requiredness),
  agentRecordReferenceFieldValidator.extend(requiredness),
  objectFieldValidator.extend(requiredness)
)

/**
 * A collection's fields. `version` starts at 1 and increases by 1 for each
 * schema change, so a record's `schemaVersion` tells which fields existed
 * when it was last written.
 */
export const collectionDefinitionValidator = v.object({
  version: v.number(),
  fields: v.array(collectionFieldValidator),
})

/** A value that can be in an index entry or a query bound. */
export const indexValueValidator = v.union(v.string(), v.number(), v.boolean())

/**
 * The value of an object field. Convex validators cannot refer to
 * themselves, so each level of nesting has its own validator. Together they
 * allow `MAX_OBJECT_DEPTH` levels of objects and arrays, the top object
 * included.
 */
const jsonLeafValidator = v.union(v.string(), v.number(), v.boolean(), v.null())
const json1Validator = v.union(
  jsonLeafValidator,
  v.array(jsonLeafValidator),
  v.record(v.string(), jsonLeafValidator)
)
const json2Validator = v.union(
  jsonLeafValidator,
  v.array(json1Validator),
  v.record(v.string(), json1Validator)
)
const json3Validator = v.union(
  jsonLeafValidator,
  v.array(json2Validator),
  v.record(v.string(), json2Validator)
)
export const objectValueValidator = v.record(v.string(), json3Validator)

/**
 * A field value: a scalar, the chosen options of a multi-select field, or
 * the object of an object field.
 */
export const recordValueValidator = v.union(
  v.string(),
  v.number(),
  v.boolean(),
  v.array(v.string()),
  objectValueValidator
)

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
  select: true,
  multiSelect: true,
  recordReference: true,
  artifactReference: true,
  object: true,
  secretRef: true,
}

/** Shared by HTTP parsers and human forms; field kinds keep scalar wire values. */
export function isFieldType(value: unknown): value is CollectionField["type"] {
  return typeof value === "string" && Object.hasOwn(FIELD_TYPES, value)
}

/** True for a field whose value comes from its list of options. */
export function isChoiceField<F extends NewCollectionField>(
  field: F
): field is Extract<F, { options: string[] }> {
  return field.type === "select" || field.type === "multiSelect"
}

/** False for field types whose values never have index entries. */
export function isIndexableType(type: CollectionField["type"]): boolean {
  return type !== "object" && type !== "secretRef"
}

/** True for the value of an object field. */
export function isObjectValue(
  value: RecordValue | undefined
): value is ObjectValue {
  return typeof value === "object" && !Array.isArray(value)
}

export function isNumericField(type: CollectionField["type"]): boolean {
  return type === "number" || type === "integer"
}

export type CollectionField = Infer<typeof collectionFieldValidator>
export type NewCollectionField = Infer<typeof newCollectionFieldValidator>
export type AgentNewField = Infer<typeof agentNewFieldValidator>
export type AgentField = Infer<typeof agentFieldValidator>
export type IndexValue = Infer<typeof indexValueValidator>
export type CollectionDefinition = Infer<typeof collectionDefinitionValidator>
export type RecordValue = Infer<typeof recordValueValidator>
export type ObjectValue = Infer<typeof objectValueValidator>
export type JsonLeaf = Infer<typeof jsonLeafValidator>
export type RecordValues = Infer<typeof recordValuesValidator>

const MAX_NAME_LENGTH = 100
export const MAX_FIELDS = 50
export const MAX_INDEXED_FIELDS = 5
export const MAX_INDEXED_TEXT_LENGTH = 200
const MAX_TEXT_LENGTH = 10_000
const MAX_RECORD_TEXT = 50_000
/** Longer than any Convex document ID. */
const MAX_REFERENCE_LENGTH = 100
export const MAX_OPTIONS = 100
export const MAX_OPTION_LENGTH = 100
/** The select value of the record form for "no value". It is not an option. */
export const NO_OPTION = "__none"
/** The select value of the record filter for "all options". It is not an option. */
export const ANY_OPTION = "__any"
const FIELD_ID = /^[a-z][a-z0-9_]{0,63}$/
/** The range of a JavaScript `Date`, in milliseconds from the epoch. */
const MAX_TIMESTAMP = 8_640_000_000_000_000

/** A short name for a record: its first nonempty text value, or its ID. */
export function recordLabel(
  fields: ReadonlyArray<CollectionField>,
  record: { _id: string; values: RecordValues }
): string {
  for (const field of fields) {
    const value = record.values[field.id]
    if (field.type === "text" && typeof value === "string" && value !== "")
      return value
  }
  return record._id
}

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

/** Arrays and objects in an object value nest at most this deep. */
export const MAX_OBJECT_DEPTH = 4
/** The most characters an object value can have as JSON. */
export const MAX_OBJECT_LENGTH = 10_000
/**
 * An object key: 1 to 100 printable ASCII characters. Convex keeps keys that
 * start with "$" or "_" for itself.
 */
const OBJECT_KEY = /^(?![$_])[\x20-\x7e]{1,100}$/

/** Any JSON value; the nested validators above are special cases of it. */
type Json = JsonLeaf | Json[] | { [key: string]: Json }

/** What makes an object value invalid, or null when it is valid. */
function objectProblem(value: ObjectValue): string | null {
  if (JSON.stringify(value).length > MAX_OBJECT_LENGTH)
    return `must be at most ${MAX_OBJECT_LENGTH} characters as JSON`
  const pending: Json[] = [value]
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    if (typeof item === "number" && !Number.isFinite(item))
      return "must contain only finite numbers"
    if (item === null || typeof item !== "object") continue
    if (Array.isArray(item)) {
      pending.push(...item)
      continue
    }
    for (const [key, child] of Object.entries(item)) {
      if (!OBJECT_KEY.test(key))
        return 'must have keys of 1 to 100 printable ASCII characters that do not start with "$" or "_"'
      pending.push(child)
    }
  }
  return null
}

/** A checked value, or a message that says what to fix. */
export type Checked<A> =
  | { readonly ok: true; readonly value: A }
  | { readonly ok: false; readonly message: string }

const invalid = (message: string): Checked<never> => ({ ok: false, message })

/**
 * Trims the options, and checks that there are 1 to 100 different ones. An
 * option cannot be `NO_OPTION` or `ANY_OPTION`, because the UI selects use
 * these values.
 */
function checkOptions(
  id: string,
  options: ReadonlyArray<string>
): Checked<string[]> {
  const trimmed = options.map((option) => option.trim())
  if (trimmed.length < 1 || trimmed.length > MAX_OPTIONS)
    return invalid(`Field "${id}" must have 1 to ${MAX_OPTIONS} options`)
  if (trimmed.some((option) => !option || option.length > MAX_OPTION_LENGTH))
    return invalid(
      `Each option of field "${id}" must be between 1 and ${MAX_OPTION_LENGTH} characters`
    )
  if (new Set(trimmed).size !== trimmed.length)
    return invalid(`Field "${id}" has the same option twice`)
  if (trimmed.some((option) => option === NO_OPTION || option === ANY_OPTION))
    return invalid(
      `Field "${id}" cannot use "${NO_OPTION}" or "${ANY_OPTION}" as an option`
    )
  return { ok: true, value: trimmed }
}

/**
 * Trims the label and options, and checks the label length, the ID format,
 * and the options.
 */
function checkField<F extends NewCollectionField>(field: F): Checked<F> {
  if (field.indexed && !isIndexableType(field.type))
    return invalid(
      `Field "${field.id}" has type ${field.type}, which cannot be indexed`
    )
  if (isChoiceField(field)) {
    const options = checkOptions(field.id, field.options)
    if (!options.ok) return options
    return checkIdentity({ ...field, options: options.value })
  }
  return checkIdentity(field)
}

/** Trims the label and checks the label length and the ID format. */
function checkIdentity<F extends NewCollectionField>(field: F): Checked<F> {
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
  field: NewCollectionField,
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

/** A select value is one option; a multi-select value lists different options. */
function checkChoice(
  field: Extract<CollectionField, { options: string[] }>,
  value: RecordValue | undefined
): Checked<RecordValue> {
  if (field.type === "select") {
    if (typeof value === "string" && field.options.includes(value))
      return { ok: true, value }
    return invalid(
      `Field "${field.id}" must be one of: ${field.options.join(", ")}`
    )
  }
  const options = new Set(field.options)
  if (
    Array.isArray(value) &&
    value.every((option) => options.has(option)) &&
    new Set(value).size === value.length
  )
    return { ok: true, value }
  return invalid(
    `Field "${field.id}" must be a list of different options from: ${field.options.join(", ")}`
  )
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
    if (isChoiceField(field)) {
      const checked = checkChoice(field, value)
      if (!checked.ok) return checked
      textLength += [checked.value].flat().join("").length
    } else if (field.type === "text") {
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
    } else if (field.type === "recordReference") {
      // convex/lib/references.ts checks that the record exists.
      if (typeof value !== "string" || value.length > MAX_REFERENCE_LENGTH)
        return invalid(
          `Field "${field.id}" must be the ID of a record in collection ${field.collectionId}`
        )
    } else if (field.type === "artifactReference") {
      if (typeof value !== "string" || value.length > MAX_REFERENCE_LENGTH)
        return invalid(
          `Field "${field.id}" must be the ID of an artifact in this workspace`
        )
    } else if (field.type === "object") {
      if (!isObjectValue(value))
        return invalid(
          `Field "${field.id}" must be a JSON object nested at most ${MAX_OBJECT_DEPTH} levels deep`
        )
      const problem = objectProblem(value)
      if (problem) return invalid(`Field "${field.id}" ${problem}`)
      textLength += JSON.stringify(value).length
    } else if (field.type === "secretRef") {
      if (typeof value !== "string" || value.length > MAX_REFERENCE_LENGTH)
        return invalid(
          `Field "${field.id}" must be the ID of a workspace secret in this workspace`
        )
    } else if (field.type === "number") {
      if (typeof value !== "number" || !Number.isFinite(value))
        return invalid(`Field "${field.id}" must be a finite number`)
    } else if (field.type === "boolean") {
      if (typeof value !== "boolean")
        return invalid(`Field "${field.id}" must be true or false`)
    }
  }
  if (textLength > MAX_RECORD_TEXT)
    return invalid(
      `Text in one record must total at most ${MAX_RECORD_TEXT} characters`
    )
  for (const field of fields) {
    const value = values[field.id]
    const kind = value === undefined ? null : credentialKind(value)
    // The message names the field and the kind, never the value.
    if (kind)
      return invalid(
        `Field "${field.id}" looks like it contains a credential (${kind}). Do not keep credentials in records: save the credential as a secret, and use a secret reference field`
      )
  }
  return { ok: true, value: values }
}

/**
 * Patterns of common credentials, such as API keys and private keys. A
 * record write that contains one is rejected. This is best effort: it finds
 * only these known shapes, not every secret.
 */
const CREDENTIAL_PATTERNS: ReadonlyArray<{ kind: string; pattern: RegExp }> = [
  { kind: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { kind: "AWS access key", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  {
    kind: "GitHub token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/,
  },
  { kind: "Slack token", pattern: /\bxox[abposr]-[A-Za-z0-9-]{10,}/ },
  { kind: "Stripe key", pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/ },
  { kind: "API key", pattern: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/ },
  { kind: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}/ },
  {
    kind: "JSON web token",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  },
]

/** The kind of the first credential pattern in a value, or null. */
function credentialKind(value: RecordValue): string | null {
  const pending: Json[] = [value]
  for (let item = pending.pop(); item !== undefined; item = pending.pop()) {
    if (typeof item === "string") {
      const match = CREDENTIAL_PATTERNS.find(({ pattern }) =>
        pattern.test(item)
      )
      if (match) return match.kind
    } else if (Array.isArray(item)) pending.push(...item)
    else if (item !== null && typeof item === "object")
      pending.push(...Object.keys(item), ...Object.values(item))
  }
  return null
}

/**
 * The index entries of a record: one per indexed field that has a value,
 * and one per chosen option of an indexed multi-select field.
 */
export function indexEntries(
  fields: ReadonlyArray<CollectionField>,
  values: RecordValues
): Array<{ fieldId: string; value: IndexValue }> {
  return fields.flatMap((field) => {
    const value = values[field.id]
    // Object fields are never indexed.
    if (!field.indexed || value === undefined || isObjectValue(value)) return []
    const entries = Array.isArray(value) ? value : [value]
    return entries.map((entry) => ({ fieldId: field.id, value: entry }))
  })
}
