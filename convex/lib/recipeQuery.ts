import type { Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { workspaceBudgets } from "./budgets"
import {
  checkBudget,
  type QueryStep,
  type Recipe,
  type RecipeRow,
} from "./recipeDomain"
import { runSavedQueryInWorkspace } from "./savedQueries"

export type QueryStepPage = {
  rows: RecipeRow[]
  isDone: boolean
  continueCursor: string
}

/**
 * Reads one page (at most 50 records) of the pinned saved query revision of a
 * query step, within the workspace query budget. Convex permits one paginated
 * read per query function, so a caller reads each page in its own query. A
 * split page fails the step. The caller has already proved access to
 * `workspaceId`.
 */
export async function readQueryPage(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  step: QueryStep,
  cursor: string | null
): Promise<QueryStepPage> {
  const queryId = ctx.db.normalizeId("queryDefinitions", step.queryId)
  if (!queryId) throw new Error("Query access denied")
  const budgets = await workspaceBudgets(ctx, workspaceId)
  const result = await runSavedQueryInWorkspace(ctx, workspaceId, {
    queryId,
    expectedRevision: step.revision,
    paginationOpts: {
      cursor,
      numItems: 50,
      maximumRowsRead: budgets.queryRowsRead,
      maximumBytesRead: budgets.queryBytesRead,
    },
  })
  if (result.pageStatus === "SplitRequired")
    throw new Error("Saved query page exceeds the query budget")
  return {
    rows: result.page.map((record) => record.values),
    isDone: result.isDone,
    continueCursor: result.continueCursor,
  }
}

/**
 * Reads the record values of a collection in `workspaceId` for a join. A
 * collection with more records than the recipe row limit fails the step. The
 * caller has already proved access to `workspaceId`.
 */
export async function readJoinCollection(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  collectionId: string,
  limits: Recipe["limits"]
): Promise<RecipeRow[]> {
  const id = ctx.db.normalizeId("collections", collectionId)
  const collection = id ? await ctx.db.get(id) : null
  if (!collection || collection.workspaceId !== workspaceId)
    throw new Error("Join collection access denied")
  const records = await ctx.db
    .query("collectionRecords")
    .withIndex("by_collection", (q) => q.eq("collectionId", collection._id))
    .take(limits.rows + 1)
  if (records.length > limits.rows)
    throw new Error("Join collection has more records than the row limit")
  const rows = records.map((record) => record.values)
  checkBudget(rows, limits)
  return rows
}
