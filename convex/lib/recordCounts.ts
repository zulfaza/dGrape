import { v, type Infer } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { workspaceBudgets } from "./budgets"

/**
 * The number of records in a collection (`collections.recordCount`). It
 * changes in the same mutation as the record write, so a retried mutation
 * cannot count a record twice.
 *
 * - "counted": `count` is exact. Each insert adds one, each delete removes one.
 * - "counting": convex/recordCounts.ts scans the records in `_creationTime`
 *   order. `count` holds the records up to `after` (null: none scanned yet).
 *   An insert or a delete changes `count` only if the record is at or before
 *   `after`; the scan counts the later records. `_creationTime` does not
 *   follow commit order, so an insert can land before `after`.
 *
 * A collection made before counts existed has no value. Its first record
 * write, or `recordCounts.startAll`, starts the scan.
 */
export const recordCountValidator = v.union(
  v.object({ kind: v.literal("counted"), count: v.number() }),
  v.object({
    kind: v.literal("counting"),
    after: v.union(v.number(), v.null()),
    count: v.number(),
  })
)
export type RecordCount = Infer<typeof recordCountValidator>

export const EMPTY_RECORD_COUNT: RecordCount = { kind: "counted", count: 0 }

/** True if `count` already includes (or must include) `record`. */
function isCounted(state: RecordCount, record: Doc<"collectionRecords">) {
  return (
    state.kind === "counted" ||
    (state.after !== null && record._creationTime <= state.after)
  )
}

export function countAfterInsert(
  state: RecordCount,
  record: Doc<"collectionRecords">
): RecordCount {
  return isCounted(state, record) ? { ...state, count: state.count + 1 } : state
}

export function countAfterDelete(
  state: RecordCount,
  record: Doc<"collectionRecords">
): RecordCount {
  return isCounted(state, record) ? { ...state, count: state.count - 1 } : state
}

/** Starts the scan for a collection that has no count, and returns its state. */
export async function startRecordCount(
  ctx: MutationCtx,
  collectionId: Id<"collections">
): Promise<RecordCount> {
  const state: RecordCount = { kind: "counting", after: null, count: 0 }
  await ctx.db.patch(collectionId, { recordCount: state })
  await ctx.scheduler.runAfter(0, internal.recordCounts.scan, {
    collectionId,
    after: null,
  })
  return state
}

/**
 * Why the collection cannot take one more record, or null. While the scan
 * runs, the count is a lower bound, so the budget is enforced from it.
 */
export async function recordBudgetProblem(
  ctx: QueryCtx,
  collection: Doc<"collections">
): Promise<string | null> {
  const { recordsPerCollection } = await workspaceBudgets(
    ctx,
    collection.workspaceId
  )
  const count = collection.recordCount?.count ?? 0
  return count >= recordsPerCollection
    ? `This collection has reached its budget of ${recordsPerCollection} records`
    : null
}
