import { Match } from "effect"
import type { Doc } from "../../convex/_generated/dataModel"
import type {
  CollectionField,
  RecordValue,
} from "../../convex/lib/collectionDomain"

/**
 * Builds export files for one collection. Both formats keep each record's
 * ID, creation time, revision, and schema version, so an export can be
 * matched back to the stored records.
 */

type Collection = Doc<"collections">
type CollectionRecord = Doc<"collectionRecords">

export type ExportFormat = "json" | "csv"

/** The record values without secret references, which exports leave out. */
function exportedValues(collection: Collection, record: CollectionRecord) {
  const secretFields = new Set(
    collection.definition.fields
      .filter((field) => field.type === "secretRef")
      .map((field) => field.id)
  )
  return Object.fromEntries(
    Object.entries(record.values).filter(([id]) => !secretFields.has(id))
  )
}

/**
 * The fields before `values` in one exported JSON record.
 * `idempotencyKey` is present only when the record has one.
 */
type ExportedRecordMetadata = {
  id: CollectionRecord["_id"]
  createdAt: string
  revision: number
  schemaVersion: number
  idempotencyKey?: string
}

/** One record in the JSON export, with keys in the order the file shows. */
function exportedRecord(collection: Collection, record: CollectionRecord) {
  const metadata: ExportedRecordMetadata = {
    id: record._id,
    createdAt: new Date(record._creationTime).toISOString(),
    revision: record.revision,
    schemaVersion: record.schemaVersion,
  }
  if (record.idempotencyKey !== undefined) {
    metadata.idempotencyKey = record.idempotencyKey
  }
  return { ...metadata, values: exportedValues(collection, record) }
}

/**
 * JSON: the collection definition and every record, as stored, except that
 * secret references are left out.
 */
export function toJson(
  collection: Collection,
  records: ReadonlyArray<CollectionRecord>
): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      collection: {
        id: collection._id,
        name: collection.name,
        schemaVersion: collection.definition.version,
        fields: collection.definition.fields,
      },
      records: records.map((record) => exportedRecord(collection, record)),
    },
    null,
    2
  )
}

/** Quotes a CSV cell when necessary. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/**
 * A text value that starts with a formula character gets a leading
 * apostrophe, so a spreadsheet shows it and does not run it.
 */
function safeText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

/** The CSV text of one field value; see {@link toCsv}. */
function csvValue(field: CollectionField, value: RecordValue | undefined) {
  if (value === undefined || field.type === "secretRef") return ""
  if (Array.isArray(value) || field.type === "object")
    return JSON.stringify(value)
  return Match.value(value).pipe(
    Match.when(Match.string, safeText),
    Match.when(Match.number, (number) =>
      field.type === "timestamp"
        ? new Date(number).toISOString()
        : String(number)
    ),
    Match.orElse(String)
  )
}

/**
 * CSV: one row per record; field columns use the field IDs. Timestamps are
 * ISO 8601 text in UTC, so spreadsheets can read them as dates.
 * Multi-select values are JSON arrays, so options that contain commas stay
 * whole. Object values are JSON. Secret reference columns are empty.
 */
export function toCsv(
  collection: Collection,
  records: ReadonlyArray<CollectionRecord>
): string {
  const { fields } = collection.definition
  const header = [
    "record_id",
    "created_at",
    "revision",
    "schema_version",
    ...fields.map((field) => field.id),
  ]
  const rows = records.map((record) => [
    record._id,
    new Date(record._creationTime).toISOString(),
    String(record.revision),
    String(record.schemaVersion),
    ...fields.map((field) => csvValue(field, record.values[field.id])),
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
}

/**
 * A file name stem from a display name, for example "job-applications".
 * `fallback` is for a name with no letters or digits.
 */
export function fileStem(name: string, fallback: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || fallback
  )
}

/** Starts a browser download of `content`. */
export function download(content: string, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement("a")
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}
