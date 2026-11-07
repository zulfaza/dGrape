import { Effect, Option, Schema, SchemaGetter } from "effect"
import { flow } from "effect/Function"
import type {
  AgentField,
  AgentNewField,
  CollectionField,
  ObjectValue,
  RecordValues,
} from "./collectionDomain"
import type { RecordQuery } from "./recordQuery"

/**
 * Schemas of agent write request bodies. They check only shape and types;
 * convex/lib/collectionDomain.ts checks the content rules. convex/http.ts
 * decodes each body with one of them, and each `parse…` function returns
 * null when the body does not have the documented shape.
 */

/** See convex/lib/operations.ts. */
type OperationKey = { idempotencyKey?: string }

export type CreateCollectionBody = OperationKey & {
  name: string
  fields: AgentField[]
}
export type CreateRecordBody = OperationKey & {
  collectionId: string
  values: RecordValues
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
export type DeleteRecordBody = OperationKey & {
  collectionId: string
  recordId: string
  expectedRevision: number
}

/**
 * A function that decodes `input` with `schema`: the decoded value, or null
 * when `input` does not match. `A` is the domain type the schema must make.
 */
export function requestParser<A>(schema: Schema.Decoder<A>) {
  return flow(Schema.decodeUnknownOption(schema), Option.getOrNull)
}
export type RequestParser<A> = ReturnType<typeof requestParser<A>>

/**
 * A key that a request may leave out or set to undefined. Decoding leaves
 * an undefined value out, so the result never has the key set to undefined.
 */
function optionalValue<S extends Schema.Top>(schema: S) {
  return Schema.optional(schema).pipe(
    Schema.decodeTo(Schema.optionalKey(schema), {
      decode: SchemaGetter.transformOptional(
        Option.filter((value) => value !== undefined)
      ),
      encode: SchemaGetter.passthrough(),
    })
  )
}

const operationKey = { idempotencyKey: optionalValue(Schema.String) }

/** A key that the request must leave out, or set to undefined. */
const Absent = optionalValue(Schema.Undefined)

const flags = {
  optional: optionalValue(Schema.Literal(true)),
  indexed: optionalValue(Schema.Literal(true)),
}

/**
 * Select fields need `options` and record reference fields need the target
 * `collectionId`; other fields must not have them. `optional` is the schema
 * of the `optional` flag, so a new field can forbid it.
 */
function fieldRequest(optional: typeof flags.optional | typeof Absent) {
  // Keys are declared in the order the parsed field had before: id, label,
  // type, options or collectionId, then the flags.
  const id = { id: Schema.String, label: Schema.String }
  const fieldFlags = { optional, indexed: flags.indexed }
  return Schema.Union([
    Schema.Struct({
      ...id,
      type: Schema.Literals(["select", "multiSelect"]),
      options: Schema.mutable(Schema.Array(Schema.String)),
      collectionId: Absent,
      ...fieldFlags,
    }),
    Schema.Struct({
      ...id,
      type: Schema.Literal("recordReference"),
      collectionId: Schema.String,
      options: Absent,
      ...fieldFlags,
    }),
    Schema.Struct({
      ...id,
      type: Schema.Literals([
        "text",
        "number",
        "integer",
        "currency",
        "boolean",
        "timestamp",
        "date",
        "artifactReference",
        "object",
        "secretRef",
      ]),
      options: Absent,
      collectionId: Absent,
      ...fieldFlags,
    }),
  ])
}

/** A schema of fields: a request field, or a union of them. */
type FieldSchema = Schema.Top & { readonly Type: { readonly type: string } }

/** The field types that no member of the field schema `S` accepts. */
type UnparsedFieldType<S extends FieldSchema> = Exclude<
  CollectionField["type"],
  S["Type"]["type"]
>

/**
 * Returns `schema`. A call fails to compile when a field type has no member
 * in it: the error then asks for the missing types as a second argument.
 */
function everyFieldType<S extends FieldSchema>(
  schema: S,
  ..._missing: [UnparsedFieldType<S>] extends [never]
    ? []
    : [missing: UnparsedFieldType<S>]
) {
  return schema
}

const FieldRequest = everyFieldType(fieldRequest(flags.optional))
const NewFieldRequest = everyFieldType(fieldRequest(Absent))

/**
 * Object values nest at most `MAX_OBJECT_DEPTH` (collectionDomain.ts) levels
 * of objects and arrays, the top object included.
 */
const Leaf = Schema.Union([
  Schema.Null,
  Schema.String,
  Schema.Number,
  Schema.Boolean,
])
function nested<S extends Schema.Top>(item: S) {
  return Schema.Union([
    Leaf,
    Schema.mutable(Schema.Array(item)),
    Schema.Record(Schema.String, item),
  ])
}
const ObjectValueRequest = Schema.Record(
  Schema.String,
  nested(nested(nested(Leaf)))
)

/**
 * Parses untrusted JSON, such as an HTTP body, into an object value. Returns
 * null for a value that is not an object, or that nests deeper than
 * `MAX_OBJECT_DEPTH` (collectionDomain.ts). Decoding makes own keys, so a
 * "__proto__" key cannot change the prototype; checkRecordValues then
 * rejects it. checkRecordValues checks the keys and the size.
 */
export const parseObjectValue = requestParser<ObjectValue>(ObjectValueRequest)

const ValuesRequest = Schema.Record(
  Schema.String,
  Schema.Union([
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    Schema.mutable(Schema.Array(Schema.String)),
    ObjectValueRequest,
  ])
)

/**
 * Copies the top-level record values by assignment, as the parser did
 * before it used a schema. A top-level "__proto__" key then sets the
 * prototype instead of becoming a key, and the write fails when Convex
 * serializes it. Making that a 400 instead is a separate change.
 */
function withAssignedValues<B extends { values: RecordValues }>(
  body: B | null
): B | null {
  if (body === null) return null
  const values: RecordValues = {}
  for (const [key, item] of Object.entries(body.values)) values[key] = item
  return { ...body, values }
}

/** A positive safe integer: the revision a write expects. */
const Revision = Schema.Number.check(
  Schema.makeFilter(Number.isSafeInteger),
  Schema.isGreaterThanOrEqualTo(1)
)

export const CreateCollectionRequest = Schema.Struct({
  name: Schema.String,
  fields: Schema.mutable(Schema.Array(FieldRequest)),
  ...operationKey,
})
export const parseCreateCollection = requestParser<CreateCollectionBody>(
  CreateCollectionRequest
)

export const AddFieldRequest = Schema.Struct({
  collectionId: Schema.String,
  field: NewFieldRequest,
  ...operationKey,
})
export const parseAddField = requestParser<AddFieldBody>(AddFieldRequest)

export const DeleteRecordRequest = Schema.Struct({
  collectionId: Schema.String,
  recordId: Schema.String,
  expectedRevision: Revision,
  ...operationKey,
})
export const parseDeleteRecord =
  requestParser<DeleteRecordBody>(DeleteRecordRequest)

export const CreateRecordRequest = Schema.Struct({
  collectionId: Schema.String,
  values: ValuesRequest,
  ...operationKey,
})
export const parseCreateRecord = flow(
  requestParser<CreateRecordBody>(CreateRecordRequest),
  withAssignedValues
)

export const UpdateRecordRequest = Schema.Struct({
  collectionId: Schema.String,
  recordId: Schema.String,
  expectedRevision: Revision,
  values: ValuesRequest,
  ...operationKey,
})
export const parseUpdateRecord = flow(
  requestParser<UpdateRecordBody>(UpdateRecordRequest),
  withAssignedValues
)

export type QueryRecordsBody = {
  collectionId: string
  query: RecordQuery
  limit: number
  cursor: string | null
}

const IndexValueRequest = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
])

/** `{ value, inclusive? }`; `inclusive` is true when absent. */
const BoundRequest = Schema.Struct({
  value: IndexValueRequest,
  inclusive: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(true))
  ),
})

/** `{ eq }` with no other key. */
const EqWhere = Schema.Record(Schema.String, IndexValueRequest)
  .check(Schema.makeFilter((where) => Object.keys(where).length === 1))
  .pipe(Schema.decodeTo(Schema.Struct({ eq: IndexValueRequest })))

/** `{ lower?, upper? }`. A body with an `eq` key is not a range. */
const RangeWhere = Schema.Struct({
  eq: Schema.optionalKey(Schema.Never),
  lower: optionalValue(BoundRequest),
  upper: optionalValue(BoundRequest),
})

/**
 * Makes the parser of `{ collectionId, fieldId, order?, where?, limit?,
 * cursor? }`. `order` is "asc" when absent and `limit` is `maxLimit` when
 * absent.
 */
export function queryRecordsParser(maxLimit: number, maxCursorBytes: number) {
  const QueryRecordsRequest = Schema.Struct({
    collectionId: Schema.String,
    fieldId: Schema.String,
    order: Schema.optional(Schema.Literals(["asc", "desc"])),
    where: optionalValue(Schema.Union([EqWhere, RangeWhere])),
    limit: Schema.optional(
      Schema.Number.check(
        Schema.makeFilter(Number.isInteger),
        Schema.isBetween({ minimum: 1, maximum: maxLimit })
      )
    ),
    cursor: Schema.optional(
      Schema.String.check(
        Schema.makeFilter(
          (cursor) => new TextEncoder().encode(cursor).length <= maxCursorBytes
        )
      )
    ),
  })
  const parse: RequestParser<QueryRecordsBody> = flow(
    Schema.decodeUnknownOption(QueryRecordsRequest),
    Option.map((request): QueryRecordsBody => {
      const query: RecordQuery = {
        fieldId: request.fieldId,
        order: request.order ?? "asc",
      }
      if (request.where !== undefined) query.where = request.where
      return {
        collectionId: request.collectionId,
        query,
        limit: request.limit ?? maxLimit,
        cursor: request.cursor ?? null,
      }
    }),
    Option.getOrNull
  )
  return parse
}
