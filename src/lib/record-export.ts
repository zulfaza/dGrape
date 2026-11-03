import type { Doc } from "../../convex/_generated/dataModel"

/**
 * Builds export files for one collection. Both formats keep each record's
 * ID, creation time, revision, and schema version, so an export can be
 * matched back to the stored records.
 */

type Collection = Doc<"collections">
type CollectionRecord = Doc<"collectionRecords">

export type ExportFormat = "json" | "csv"

/** JSON: the collection definition and every record, as stored. */
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
      records: records.map((record) => ({
        id: record._id,
        createdAt: new Date(record._creationTime).toISOString(),
        revision: record.revision,
        schemaVersion: record.schemaVersion,
        ...(record.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: record.idempotencyKey }),
        values: record.values,
      })),
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

/**
 * CSV: one row per record; field columns use the field IDs. Timestamps are
 * ISO 8601 text in UTC, so spreadsheets can read them as dates.
 * Multi-select values are JSON arrays, so options that contain commas stay
 * whole.
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
    ...fields.map((field) => {
      const value = record.values[field.id]
      if (value === undefined) return ""
      if (Array.isArray(value)) return JSON.stringify(value)
      if (field.type === "timestamp" && typeof value === "number")
        return new Date(value).toISOString()
      return typeof value === "string" ? safeText(value) : String(value)
    }),
  ])
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")
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
