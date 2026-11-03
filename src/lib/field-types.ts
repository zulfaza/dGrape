import type {
  Checked,
  CollectionField,
  RecordValue,
} from "../../convex/lib/collectionDomain"

/**
 * Form rules for each field type: the label people see, and how a stored
 * value maps to the text of an input and back. The record form and the
 * query bar both use these, so they read and write values the same way.
 */

type FieldType = CollectionField["type"]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  number: "Number",
  integer: "Integer / minor units",
  currency: "Currency code",
  boolean: "Yes / no",
  timestamp: "Date and time",
  date: "Date",
}

/** The field types in the order the type pickers show them. */
export const FIELD_TYPES: ReadonlyArray<FieldType> = [
  "text",
  "number",
  "integer",
  "currency",
  "boolean",
  "timestamp",
  "date",
]

/** The HTML input type for a field that is not a yes/no field. */
export function inputType(type: FieldType): string {
  if (type === "number" || type === "integer") return "number"
  if (type === "timestamp") return "datetime-local"
  if (type === "date") return "date"
  return "text"
}

/** The HTML `step` for a field input, or undefined for no step. */
export function inputStep(type: FieldType): number | "any" | undefined {
  if (type === "integer") return 1
  if (type === "number" || type === "timestamp") return "any"
  return undefined
}

const pad = (value: number, length = 2) => String(value).padStart(length, "0")

/**
 * The text of a date-time input for a timestamp: local
 * "YYYY-MM-DDTHH:mm:ss", plus ".sss" when the milliseconds are not zero.
 */
export function timestampInputText(timestamp: number): string {
  const date = new Date(timestamp)
  const text = `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  const ms = date.getMilliseconds()
  return ms === 0 ? text : `${text}.${pad(ms, 3)}`
}

/**
 * Converts input text to a value of the field's type. A date-time input
 * gives local time, which becomes milliseconds since the epoch. The domain
 * rules (convex/lib/collectionDomain.ts) still check the result.
 */
export function fromInputText(
  type: FieldType,
  text: string
): Checked<RecordValue> {
  if (type === "number" || type === "integer") {
    const value = Number(text)
    return text.trim() === "" || !Number.isFinite(value)
      ? { ok: false, message: "Enter a valid number" }
      : { ok: true, value }
  }
  if (type === "timestamp") {
    const value = new Date(text).getTime()
    return text.trim() === "" || !Number.isFinite(value)
      ? { ok: false, message: "Enter a valid date and time" }
      : { ok: true, value }
  }
  return { ok: true, value: text }
}
