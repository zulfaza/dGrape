import { Schema, SchemaGetter } from "effect"

const RunBody = Schema.Struct({ runId: Schema.String, epoch: Schema.Int })
const StepBody = Schema.Struct({ ...RunBody.fields, step: Schema.Int })

// Keep invalid runs distinct from bodies that are not JSON objects.
const InvalidRun = Schema.Record(Schema.String, Schema.Unknown).pipe(
  Schema.decodeTo(Schema.Null, {
    decode: SchemaGetter.transform(() => null),
    encode: SchemaGetter.transform(() => ({})),
  })
)
export const RecipeRequest = Schema.Union([StepBody, RunBody, InvalidRun])
export type RecipeBody =
  | typeof RunBody.Type
  | typeof StepBody.Type
  | Record<string, never>

const ClaimFields = {
  epoch: Schema.Number,
  timedOut: Schema.optionalKey(Schema.Unknown),
}
const RunnerClaims = Schema.Array(
  Schema.Union([
    Schema.Struct({ runId: Schema.String, ...ClaimFields }),
    Schema.Struct({
      _id: Schema.String,
      runId: Schema.optionalKey(Schema.Never),
      ...ClaimFields,
    }),
  ])
)
export type RunnerClaims = typeof RunnerClaims.Type

const RunnerPlan = Schema.NullOr(
  Schema.Struct({ steps: Schema.Number, attempts: Schema.Number })
)
export interface RecipeOperation<A> {
  readonly path: string
  readonly response: Schema.Codec<A, unknown>
}
export const RecipeOperations = {
  dispatch: { path: "dispatch", response: RunnerClaims },
  reconcile: { path: "reconcile", response: RunnerClaims },
  begin: { path: "begin", response: RunnerPlan },
  fail: { path: "fail", response: Schema.Null },
  step: { path: "step", response: Schema.Null },
}
