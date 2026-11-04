import { Schema } from "effect"
import type { SavedQuery } from "./queryAggregate"

/**
 * Wire contract of the agent saved-query operations. The HTTP routes
 * (convex/http.ts) decode with these schemas, and the MCP tools
 * (src/mcp/server.ts) use them for parameters and results.
 */

export const MAX_PAGE_SIZE = 50
const MAX_CURSOR_LENGTH = 4096

const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
const Bound = Schema.Struct({
  value: Value,
  inclusive: Schema.optionalKey(Schema.Boolean),
})
/**
 * An object field value, nested at most four levels deep like
 * `objectValueValidator` in collectionDomain.ts, which also checks its keys
 * and size.
 */
const JsonLeaf = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null,
])
const nested = <S extends Schema.Top>(item: S) =>
  Schema.Union([
    JsonLeaf,
    Schema.Array(item),
    Schema.Record(Schema.String, item),
  ])
const ObjectValue = Schema.Record(
  Schema.String,
  nested(nested(nested(JsonLeaf)))
)
/**
 * A record value: a scalar, the chosen options of a multi-select field, or
 * the object of an object field.
 */
export const RecordValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Array(Schema.String),
  ObjectValue,
])
const fieldIdentity = {
  id: Schema.String,
  label: Schema.String,
  optional: Schema.optionalKey(Schema.Literal(true)),
  indexed: Schema.optionalKey(Schema.Literal(true)),
}
/** A field of a saved query result; collectionDomain.ts has its rules. */
export const Field = Schema.Union([
  Schema.Struct({
    ...fieldIdentity,
    type: Schema.Literals([
      "text",
      "number",
      "boolean",
      "integer",
      "currency",
      "timestamp",
      "date",
      "artifactReference",
      "secretRef",
    ]),
  }),
  Schema.Struct({
    ...fieldIdentity,
    type: Schema.Literals(["select", "multiSelect"]),
    options: Schema.Array(Schema.String),
  }),
  Schema.Struct({
    ...fieldIdentity,
    type: Schema.Literal("recordReference"),
    collectionId: Schema.String,
  }),
  Schema.Struct({ ...fieldIdentity, type: Schema.Literal("object") }),
])
const Limit = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: MAX_PAGE_SIZE })
)
const Cursor = Schema.String.check(Schema.isMaxLength(MAX_CURSOR_LENGTH))

/** A residual filter; convex/lib/recordQuery.ts has its rules. */
const Filter = Schema.Union([
  Schema.Struct({
    fieldId: Schema.String,
    op: Schema.Literals(["eq", "neq", "lt", "lte", "gt", "gte"]),
    value: Value,
  }),
  Schema.Struct({
    fieldId: Schema.String,
    op: Schema.Literal("in"),
    values: Schema.Array(Value),
  }),
])

/** An aggregate; convex/lib/queryAggregate.ts has its rules. */
const Aggregate = Schema.Struct({
  groupBy: Schema.optionalKey(
    Schema.Struct({
      fieldId: Schema.String,
      bucket: Schema.optionalKey(
        Schema.Literals(["day", "week", "month", "year"])
      ),
    })
  ),
  measures: Schema.Array(
    Schema.Union([
      Schema.Struct({ op: Schema.Literal("count") }),
      Schema.Struct({
        op: Schema.Literals(["sum", "min", "max", "average"]),
        fieldId: Schema.String,
      }),
    ])
  ),
})

/** A saved query, as queries_save takes it. */
export const Query = Schema.Struct({
  fieldId: Schema.String,
  order: Schema.optionalKey(Schema.Literals(["asc", "desc"])),
  where: Schema.optionalKey(
    Schema.Union([
      Schema.Struct({ eq: Value }),
      Schema.Struct({ in: Schema.Array(Value) }),
      Schema.Struct({
        lower: Schema.optionalKey(Bound),
        upper: Schema.optionalKey(Bound),
      }),
    ])
  ),
  filters: Schema.optionalKey(Schema.Array(Filter)),
  select: Schema.optionalKey(Schema.Array(Schema.String)),
  aggregate: Schema.optionalKey(Aggregate),
})

/** Adds the defaults: "asc" order and inclusive bounds. */
export function toSavedQuery(query: typeof Query.Type): SavedQuery {
  const saved: SavedQuery = {
    fieldId: query.fieldId,
    order: query.order ?? "asc",
  }
  const { where, filters, select, aggregate } = query
  if (where !== undefined) saved.where = toWhere(where)
  if (filters !== undefined)
    saved.filters = filters.map((filter) =>
      filter.op === "in"
        ? { fieldId: filter.fieldId, op: "in", values: [...filter.values] }
        : { fieldId: filter.fieldId, op: filter.op, value: filter.value }
    )
  if (select !== undefined) saved.select = [...select]
  if (aggregate !== undefined) {
    const measures = aggregate.measures.map((measure) =>
      measure.op === "count"
        ? { op: measure.op }
        : { op: measure.op, fieldId: measure.fieldId }
    )
    const { groupBy } = aggregate
    saved.aggregate =
      groupBy === undefined
        ? { measures }
        : { measures, groupBy: { ...groupBy } }
  }
  return saved
}

function toWhere(
  where: NonNullable<typeof Query.Type.where>
): NonNullable<SavedQuery["where"]> {
  if ("eq" in where) return { eq: where.eq }
  if ("in" in where) return { in: [...where.in] }
  const range: NonNullable<SavedQuery["where"]> = {}
  if (where.lower)
    range.lower = {
      value: where.lower.value,
      inclusive: where.lower.inclusive ?? true,
    }
  if (where.upper)
    range.upper = {
      value: where.upper.value,
      inclusive: where.upper.inclusive ?? true,
    }
  return range
}

export const SaveInput = Schema.Struct({
  collectionId: Schema.String,
  name: Schema.String,
  query: Query,
  queryId: Schema.optionalKey(Schema.String),
  expectedRevision: Schema.optionalKey(Schema.Int),
  /** See convex/lib/operations.ts. */
  idempotencyKey: Schema.optionalKey(Schema.String),
})

export const Saved = Schema.Struct({
  queryId: Schema.String,
  revision: Schema.Number,
})

export const ListInput = Schema.Struct({
  limit: Schema.optionalKey(Limit),
  cursor: Schema.optionalKey(Cursor),
})

export const SavedQueryPage = Schema.Struct({
  page: Schema.Array(
    Schema.Struct({
      queryId: Schema.String,
      collectionId: Schema.String,
      name: Schema.String,
      revision: Schema.Number,
      status: Schema.Literals(["current", "stale"]),
      fields: Schema.Array(Field),
    })
  ),
  isDone: Schema.Boolean,
  continueCursor: Schema.String,
})

export const RunInput = Schema.Struct({
  queryId: Schema.String,
  revision: Schema.Int,
  limit: Schema.optionalKey(Limit),
  cursor: Schema.optionalKey(Cursor),
})

/** Mirrors sourceFreshnessValidator in convex/lib/sourceSync.ts. */
const SourceFreshness = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("never_synced") }),
  Schema.Struct({
    kind: Schema.Literal("synced"),
    lastSuccessfulSyncAt: Schema.Number,
    runId: Schema.String,
    staleAfter: Schema.NullOr(Schema.Number),
  }),
  Schema.Struct({
    kind: Schema.Literal("stale"),
    lastSuccessfulSyncAt: Schema.Number,
    lastFailedAt: Schema.Number,
    failedRunId: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("failed"),
    lastFailedAt: Schema.Number,
    failedRunId: Schema.String,
  }),
])

/** Mirrors sourceStatusValidator in convex/lib/sourceSync.ts. */
const Source = Schema.Struct({
  collectionId: Schema.String,
  name: Schema.String,
  freshness: SourceFreshness,
})

export const RunPage = Schema.Struct({
  queryId: Schema.String,
  revision: Schema.Number,
  resultSchema: Schema.Struct({
    version: Schema.Number,
    fields: Schema.Array(Field),
  }),
  page: Schema.Array(
    Schema.Struct({
      _id: Schema.String,
      _creationTime: Schema.Number,
      revision: Schema.Number,
      values: Schema.Record(Schema.String, RecordValue),
    })
  ),
  isDone: Schema.Boolean,
  continueCursor: Schema.String,
  completeness: Schema.Literals(["complete", "partial"]),
  evaluatedAt: Schema.Number,
  dataAsOf: Schema.NullOr(Schema.Number),
  source: Source,
})

export const AggregateInput = Schema.Struct({
  queryId: Schema.String,
  revision: Schema.Int,
})

/** Mirrors savedAggregateValidator in convex/lib/savedQueries.ts. */
export const AggregateResult = Schema.Struct({
  kind: Schema.Literal("aggregate"),
  queryId: Schema.String,
  revision: Schema.Number,
  resultSchema: Schema.Struct({
    version: Schema.Number,
    fields: Schema.Array(Field),
  }),
  rows: Schema.Array(
    Schema.Struct({
      key: Schema.String,
      values: Schema.Record(Schema.String, RecordValue),
    })
  ),
  matched: Schema.Number,
  completeness: Schema.Literal("complete"),
  evaluatedAt: Schema.Number,
  dataAsOf: Schema.NullOr(Schema.Number),
  source: Source,
})
