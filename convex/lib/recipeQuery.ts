import type { Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { workspaceBudgets } from "./budgets"
import type { QueryStep, RecipeRow } from "./recipeDomain"
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
