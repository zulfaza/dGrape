import { ConvexError, type Value } from "convex/values"
import { Result, Schema } from "effect"

/**
 * The typed failure of a query that needs more than its budget. A query
 * never returns a silently truncated result: it returns this error, with a
 * hint that tells the caller how to narrow the query or how to materialize
 * the result (ADR 0004).
 *
 * `status` is 400, so convex/lib/agentRoute.ts sends it to agents as a
 * client error with `code` and `hint`.
 */
export type QueryTooExpensive = {
  readonly kind: "QueryTooExpensive"
  readonly status: 400
  /** The budget that the query needs more of. */
  readonly budget: QueryBudget
  /** The value of that budget for this read. */
  readonly limit: number
  readonly message: string
  readonly hint: string
}

/** - "resultBytes": the bytes of one result page. */
export type QueryBudget = "resultBytes"

const MATERIALIZE =
  "For a larger report, run a recipe with an aggregate step that writes a summary collection, then query that collection."

const DETAILS: Record<QueryBudget, { message: string; hint: string }> = {
  resultBytes: {
    message: "Query result byte budget exceeded",
    hint: `Lower the page size. ${MATERIALIZE}`,
  },
}

export function queryTooExpensive(
  budget: QueryBudget,
  limit: number
): ConvexError<QueryTooExpensive> {
  const details = DETAILS[budget]
  return new ConvexError({
    kind: "QueryTooExpensive",
    status: 400,
    budget,
    limit,
    message: `${details.message} (limit ${limit})`,
    hint: details.hint,
  })
}

const Data = Schema.Struct({
  kind: Schema.Literal("QueryTooExpensive"),
  status: Schema.Literal(400),
  budget: Schema.Literals(["resultBytes"]),
  limit: Schema.Number,
  message: Schema.String,
  hint: Schema.String,
})

/** The QueryTooExpensive data of `error`, or null for any other error. */
export function asQueryTooExpensive(
  error: ConvexError<Value>
): QueryTooExpensive | null {
  const decoded = Schema.decodeUnknownResult(Data)(error.data)
  return Result.isSuccess(decoded) ? decoded.success : null
}
