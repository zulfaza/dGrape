import type { CollectionField, RecordValues } from "./collectionDomain"

/**
 * Parsers for agent write request bodies. They check only shape and types;
 * convex/lib/collectionDomain.ts checks the content rules. Each returns null
 * when the body does not have the documented shape.
 */

export type CreateCollectionBody = {
  name: string
  fields: CollectionField[]
}
export type CreateRecordBody = {
  collectionId: string
  values: RecordValues
  idempotencyKey?: string
}
export type UpdateRecordBody = {
  collectionId: string
  recordId: string
  expectedRevision: number
  values: RecordValues
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseField(value: unknown): CollectionField | null {
  if (!isObject(value)) return null
  const { id, label, type } = value
  if (typeof id !== "string" || typeof label !== "string") return null
  if (type !== "text" && type !== "number" && type !== "boolean") return null
  return { id, label, type }
}

function parseValues(value: unknown): RecordValues | null {
  if (!isObject(value)) return null
  const values: RecordValues = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean"
    )
      return null
    values[key] = item
  }
  return values
}

export function parseCreateCollection(
  body: unknown
): CreateCollectionBody | null {
  if (!isObject(body) || typeof body.name !== "string") return null
  if (!Array.isArray(body.fields)) return null
  const fields: CollectionField[] = []
  for (const item of body.fields) {
    const field = parseField(item)
    if (!field) return null
    fields.push(field)
  }
  return { name: body.name, fields }
}

export function parseCreateRecord(body: unknown): CreateRecordBody | null {
  if (!isObject(body) || typeof body.collectionId !== "string") return null
  const values = parseValues(body.values)
  if (!values) return null
  const { idempotencyKey } = body
  if (idempotencyKey === undefined)
    return { collectionId: body.collectionId, values }
  if (typeof idempotencyKey !== "string") return null
  return { collectionId: body.collectionId, values, idempotencyKey }
}

export function parseUpdateRecord(body: unknown): UpdateRecordBody | null {
  if (!isObject(body)) return null
  const { collectionId, recordId, expectedRevision } = body
  if (typeof collectionId !== "string" || typeof recordId !== "string")
    return null
  if (
    typeof expectedRevision !== "number" ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1
  )
    return null
  const values = parseValues(body.values)
  if (!values) return null
  return { collectionId, recordId, expectedRevision, values }
}
