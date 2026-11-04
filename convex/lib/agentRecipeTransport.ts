import { Schema } from "effect"

const Value = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
const Values = Schema.Record(Schema.String, Value)
export const Recipe = Schema.Struct({
  steps: Schema.mutable(
    Schema.Array(
      Schema.Union([
        Schema.Struct({
          kind: Schema.Literal("fetch"),
          connectionId: Schema.String,
          route: Schema.String,
          maxPages: Schema.Number,
        }),
        Schema.Struct({
          kind: Schema.Literal("map"),
          fields: Schema.Record(Schema.String, Schema.String),
        }),
        Schema.Struct({
          kind: Schema.Literal("filter"),
          field: Schema.String,
          equals: Value,
        }),
        Schema.Struct({
          kind: Schema.Literal("join"),
          field: Schema.String,
          rightField: Schema.String,
          prefix: Schema.String,
          rows: Schema.mutable(Schema.Array(Values)),
        }),
        Schema.Struct({
          kind: Schema.Literal("aggregate"),
          groupBy: Schema.String,
          operation: Schema.Literals(["count", "sum"]),
          field: Schema.optionalKey(Schema.String),
          output: Schema.String,
        }),
        Schema.Struct({
          kind: Schema.Literal("upsert"),
          collectionId: Schema.String,
          source: Schema.String,
          identityField: Schema.String,
        }),
        Schema.Struct({
          kind: Schema.Literal("snapshot"),
          collectionId: Schema.String,
        }),
        Schema.Struct({
          kind: Schema.Literal("artifact"),
          name: Schema.String,
          format: Schema.Literal("json"),
        }),
      ])
    )
  ),
  limits: Schema.Struct({
    rows: Schema.Number,
    bytes: Schema.Number,
    durationMs: Schema.Number,
    attempts: Schema.Number,
  }),
})
export const Timing = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("once"), at: Schema.Number }),
  Schema.Struct({ kind: Schema.Literal("cron"), expression: Schema.String }),
])
const Document = { _id: Schema.String, _creationTime: Schema.Number }
const Workspace = {
  ...Document,
  workspaceId: Schema.String,
  versionId: Schema.String,
}
const Version = Schema.Struct({
  ...Document,
  workspaceId: Schema.String,
  createdBy: Schema.String,
  name: Schema.String,
  recipe: Recipe,
})
const Run = Schema.Struct({
  ...Workspace,
  scheduleId: Schema.optionalKey(Schema.String),
  retryOf: Schema.optionalKey(Schema.String),
  key: Schema.String,
  state: Schema.Literals([
    "pending",
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "skipped",
  ]),
  cancelRequested: Schema.Boolean,
  leaseUntil: Schema.Number,
  epoch: Schema.Number,
  nextStep: Schema.Number,
  outputToken: Schema.optionalKey(Schema.String),
  startedAt: Schema.optionalKey(Schema.Number),
  finishedAt: Schema.optionalKey(Schema.Number),
})
const Schedule = Schema.Struct({
  ...Workspace,
  timing: Timing,
  enabled: Schema.Boolean,
  nextAt: Schema.Number,
  activeRunId: Schema.optionalKey(Schema.String),
  revision: Schema.optionalKey(Schema.Number),
})
const Attempt = Schema.Struct({
  ...Document,
  runId: Schema.String,
  step: Schema.Number,
  attempt: Schema.Number,
  state: Schema.Literals(["started", "succeeded", "failed"]),
  error: Schema.optionalKey(Schema.String),
  startedAt: Schema.Number,
  finishedAt: Schema.optionalKey(Schema.Number),
})
const PageFields = { isDone: Schema.Boolean, continueCursor: Schema.String }
export const VersionPage = Schema.Struct({
  ...PageFields,
  page: Schema.Array(Version),
})
export const RunPage = Schema.Struct({ ...PageFields, page: Schema.Array(Run) })
export const SchedulePage = Schema.Struct({
  ...PageFields,
  page: Schema.Array(Schedule),
})
export const HistoryPage = Schema.Struct({
  ...PageFields,
  page: Schema.Array(Attempt),
})
export const PageInput = Schema.Struct({
  paginationOpts: Schema.Struct({
    numItems: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 })),
    cursor: Schema.NullOr(Schema.String.check(Schema.isMaxLength(4096))),
  }),
})
/** An optional idempotency key; see convex/lib/operations.ts. */
const OperationKey = { idempotencyKey: Schema.optionalKey(Schema.String) }
export const PublishInput = Schema.Struct({
  name: Schema.String,
  recipe: Recipe,
  ...OperationKey,
})
export const ValidateInput = Schema.Struct({ recipe: Recipe })
export const PreviewInput = Schema.Struct({
  recipe: Recipe,
  sample: Schema.mutable(Schema.Array(Values)).check(Schema.isMaxLength(1000)),
})
const StepKind = Schema.Literals([
  "fetch",
  "map",
  "filter",
  "join",
  "aggregate",
  "upsert",
  "snapshot",
  "artifact",
])
const FailedCheck = Schema.Struct({
  ok: Schema.Literal(false),
  error: Schema.String,
})
export const ValidateResult = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true) }),
  FailedCheck,
])
export const PreviewResult = Schema.Union([
  Schema.Struct({
    ok: Schema.Literal(true),
    steps: Schema.Array(Schema.Struct({ kind: StepKind, rows: Schema.Number })),
    rows: Schema.Array(Values),
  }),
  FailedCheck,
])
export const HistoryInput = Schema.Struct({
  ...PageInput.fields,
  runId: Schema.String,
})
export const TriggerInput = Schema.Struct({
  versionId: Schema.String,
  idempotencyKey: Schema.String,
})
export const ScheduleInput = Schema.Struct({
  versionId: Schema.String,
  timing: Timing,
  ...OperationKey,
})
export const EnabledInput = Schema.Struct({
  scheduleId: Schema.String,
  enabled: Schema.Boolean,
  ...OperationKey,
})
export const UpdateScheduleInput = Schema.Struct({
  scheduleId: Schema.String,
  expectedRevision: Schema.Int,
  versionId: Schema.String,
  timing: Timing,
  ...OperationKey,
})
export const UpdateScheduleResult = Schema.Struct({ revision: Schema.Number })
export const CancelInput = Schema.Struct({
  runId: Schema.String,
  ...OperationKey,
})
export const RetryInput = Schema.Struct({
  runId: Schema.String,
  idempotencyKey: Schema.String,
})
export const AccessInput = Schema.Struct({
  versionId: Schema.String,
  userId: Schema.String,
  allowed: Schema.Boolean,
  ...OperationKey,
})
