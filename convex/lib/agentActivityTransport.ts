import { Schema } from "effect"

/**
 * Wire contract of the agent activity history. The HTTP route
 * (convex/http.ts) decodes with these schemas, and the MCP tool
 * (src/mcp/server.ts) uses them for parameters and results. An event matches
 * auditEventValidator in convex/lib/auditEvents.ts.
 */

export const MAX_PAGE_SIZE = 50

export const ListInput = Schema.Struct({
  limit: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_PAGE_SIZE }))
  ),
  cursor: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(4096))),
})

const Actor = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("user"), userId: Schema.String }),
  Schema.Struct({
    kind: Schema.Literal("agent"),
    grantId: Schema.String,
    registrationId: Schema.NullOr(Schema.String),
    owner: Schema.String,
  }),
  Schema.Struct({
    kind: Schema.Literal("scheduler"),
    scheduleId: Schema.String,
  }),
])

/** The operation name and the IDs, revisions and flags of the change. */
const Event = Schema.StructWithRest(
  Schema.Struct({ operation: Schema.String }),
  [Schema.Record(Schema.String, Schema.Unknown)]
)

export const ActivityPage = Schema.Struct({
  page: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      createdAt: Schema.Number,
      actor: Actor,
      event: Event,
    })
  ),
  isDone: Schema.Boolean,
  continueCursor: Schema.String,
})
