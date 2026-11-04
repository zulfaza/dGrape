import { isFieldType } from "./collectionDomain"
import type {
  AgentField,
  AgentNewField,
  IndexValue,
  RecordValues,
} from "./collectionDomain"
import type { RecordQuery } from "./recordQuery"

/**
 * Parsers for agent write request bodies. They check only shape and types;
 * convex/lib/collectionDomain.ts checks the content rules. Each returns null
 * when the body does not have the documented shape.
 */

/** See convex/lib/operations.ts. */
type OperationKey = { idempotencyKey?: string }

export type CreateCollectionBody = OperationKey & {
  name: string
  fields: AgentField[]
}
export type CreateRecordBody = {
  collectionId: string
  values: RecordValues
  idempotencyKey?: string
}
export type AddFieldBody = OperationKey & {
  collectionId: string
  field: AgentNewField
}
export type UpdateRecordBody = OperationKey & {
  collectionId: string
  recordId: string
  expectedRevision: number
  values: RecordValues
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Reads the optional `idempotencyKey`; null when it is not a string. */
function parseOperationKey(body: Record<string, unknown>): OperationKey | null {
  const { idempotencyKey } = body
  if (idempotencyKey === undefined) return {}
  if (typeof idempotencyKey !== "string") return null
  return { idempotencyKey }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

/**
 * Select fields need `options` and record reference fields need the target
 * `collectionId`; other fields must not have them.
 */
function parseField(value: unknown): AgentField | null {
  if (!isObject(value)) return null
  const { id, label, type, options, collectionId, optional, indexed } = value
  if (typeof id !== "string" || typeof label !== "string") return null
  if (!isFieldType(type)) return null
  if (optional !== undefined && optional !== true) return null
  if (indexed !== undefined && indexed !== true) return null
  const flags: Pick<AgentField, "optional" | "indexed"> = {
    ...(optional ? { optional } : {}),
    ...(indexed ? { indexed } : {}),
  }
  if (type === "select" || type === "multiSelect")
    return isStringArray(options) && collectionId === undefined
      ? { id, label, type, options, ...flags }
      : null
  if (type === "recordReference")
    return typeof collectionId === "string" && options === undefined
      ? { id, label, type, collectionId, ...flags }
      : null
  if (options !== undefined || collectionId !== undefined) return null
  return { id, label, type, ...flags }
}

function parseValues(value: unknown): RecordValues | null {
  if (!isObject(value)) return null
  const values: RecordValues = {}
  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item !== "string" &&
      typeof item !== "number" &&
      typeof item !== "boolean" &&
      !isStringArray(item)
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
  const key = parseOperationKey(body)
  if (!key) return null
  const fields: AgentField[] = []
  for (const item of body.fields) {
    const field = parseField(item)
    if (!field) return null
    fields.push(field)
  }
  return { name: body.name, fields, ...key }
}

export function parseAddField(body: unknown): AddFieldBody | null {
  if (!isObject(body) || typeof body.collectionId !== "string") return null
  if (!isObject(body.field) || body.field.optional !== undefined) return null
  const field = parseField(body.field)
  const key = parseOperationKey(body)
  if (!field || !key) return null
  return { collectionId: body.collectionId, field, ...key }
}

export type DeleteRecordBody = OperationKey & {
  collectionId: string
  recordId: string
  expectedRevision: number
}

export function parseDeleteRecord(body: unknown): DeleteRecordBody | null {
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
  const key = parseOperationKey(body)
  if (!key) return null
  return { collectionId, recordId, expectedRevision, ...key }
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
  const key = parseOperationKey(body)
  if (!values || !key) return null
  return { collectionId, recordId, expectedRevision, values, ...key }
}

export type QueryRecordsBody = {
  collectionId: string
  query: RecordQuery
  limit: number
  cursor: string | null
}

function isIndexValue(value: unknown): value is IndexValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
}

type Bound = { value: IndexValue; inclusive: boolean }

/** Parses `{ value, inclusive? }`; `inclusive` is true when absent. */
function parseBound(value: unknown): Bound | null | undefined {
  if (value === undefined) return undefined
  if (!isObject(value) || !isIndexValue(value.value)) return null
  const { inclusive } = value
  if (inclusive !== undefined && typeof inclusive !== "boolean") return null
  return { value: value.value, inclusive: inclusive ?? true }
}

function parseWhere(value: unknown): RecordQuery["where"] | null {
  if (value === undefined) return undefined
  if (!isObject(value)) return null
  if ("eq" in value) {
    if (!isIndexValue(value.eq) || Object.keys(value).length !== 1) return null
    return { eq: value.eq }
  }
  const lower = parseBound(value.lower)
  const upper = parseBound(value.upper)
  if (lower === null || upper === null) return null
  return {
    ...(lower ? { lower } : {}),
    ...(upper ? { upper } : {}),
  }
}

/**
 * Parses `{ collectionId, fieldId, order?, where?, limit?, cursor? }`.
 * `order` is "asc" when absent and `limit` is `maxLimit` when absent.
 */
export function parseQueryRecords(
  body: unknown,
  maxLimit: number,
  maxCursorBytes: number
): QueryRecordsBody | null {
  if (!isObject(body)) return null
  const { collectionId, fieldId, order, limit, cursor } = body
  if (typeof collectionId !== "string" || typeof fieldId !== "string")
    return null
  if (order !== undefined && order !== "asc" && order !== "desc") return null
  if (
    limit !== undefined &&
    (typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > maxLimit)
  )
    return null
  if (
    cursor !== undefined &&
    (typeof cursor !== "string" ||
      new TextEncoder().encode(cursor).length > maxCursorBytes)
  )
    return null
  const where = parseWhere(body.where)
  if (where === null) return null
  return {
    collectionId,
    query: {
      fieldId,
      order: order ?? "asc",
      ...(where ? { where } : {}),
    },
    limit: limit ?? maxLimit,
    cursor: cursor ?? null,
  }
}
