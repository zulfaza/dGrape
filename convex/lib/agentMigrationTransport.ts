import { Schema } from "effect"
import { Field } from "./agentQueryTransport"

/**
 * Wire contract of the agent schema migration operations. The HTTP routes
 * (convex/http.ts) decode with these schemas, and the MCP tools
 * (src/mcp/server.ts) use them for parameters and results. The rules are in
 * convex/lib/schemaMigrations.ts.
 */

const RecordValue = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.mutable(Schema.Array(Schema.String)),
])

const fieldIdentity = {
  id: Schema.String,
  label: Schema.String,
  optional: Schema.optionalKey(Schema.Literal(true)),
  indexed: Schema.optionalKey(Schema.Literal(true)),
}
/** A target field; agentQueryTransport.Field with mutable options. */
const TargetField = Schema.Union([
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
    ]),
  }),
  Schema.Struct({
    ...fieldIdentity,
    type: Schema.Literals(["select", "multiSelect"]),
    options: Schema.mutable(Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    ...fieldIdentity,
    type: Schema.Literal("recordReference"),
    collectionId: Schema.String,
  }),
])

export const PlanInput = Schema.Struct({
  collectionId: Schema.String,
  expectedVersion: Schema.Int,
  fields: Schema.mutable(Schema.Array(TargetField)),
  defaults: Schema.optionalKey(Schema.Record(Schema.String, RecordValue)),
})

export const Planned = Schema.Struct({ migrationId: Schema.String })

export const MigrationInput = Schema.Struct({ migrationId: Schema.String })

const Definition = Schema.Struct({
  version: Schema.Number,
  fields: Schema.Array(Field),
})
const Cursor = Schema.NullOr(Schema.Number)
const DryRunProgress = {
  checked: Schema.Number,
  misfitCount: Schema.Number,
  misfits: Schema.Array(
    Schema.Struct({ recordId: Schema.String, message: Schema.String })
  ),
}

/** Mirrors migrationStateValidator in convex/lib/schemaMigrations.ts. */
const State = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("planned") }),
  Schema.Struct({
    kind: Schema.Literal("dryRunning"),
    after: Cursor,
    ...DryRunProgress,
  }),
  Schema.Struct({ kind: Schema.Literal("checked"), ...DryRunProgress }),
  Schema.Struct({
    kind: Schema.Literal("validating"),
    after: Cursor,
    ...DryRunProgress,
  }),
  Schema.Struct({
    kind: Schema.Literal("backfilling"),
    after: Cursor,
    written: Schema.Number,
    error: Schema.NullOr(Schema.String),
  }),
  Schema.Struct({
    kind: Schema.Literal("active"),
    written: Schema.Number,
    activatedAt: Schema.Number,
  }),
  Schema.Struct({ kind: Schema.Literal("cancelled") }),
])

export const Migration = Schema.Struct({
  _id: Schema.String,
  collectionId: Schema.String,
  source: Definition,
  target: Definition,
  state: State,
  rollbackLimitations: Schema.Array(Schema.String),
  outdated: Schema.Boolean,
})
