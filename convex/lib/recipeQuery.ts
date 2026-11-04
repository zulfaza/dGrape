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

/**
 * Reads every record of the pinned saved query revision of a query step, in
 * one transaction. Each page uses the workspace query budget. More pages than
 * `maxPages`, a split page, or rows over the recipe limits fail the step.
 * The caller has already proved access to `workspaceId`.
 */
export async function readQueryStep(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  step: QueryStep,
  limits: Recipe["limits"]
): Promise<RecipeRow[]> {
  const queryId = ctx.db.normalizeId("queryDefinitions", step.queryId)
  if (!queryId) throw new Error("Query access denied")
  const budgets = await workspaceBudgets(ctx, workspaceId)
  const rows: RecipeRow[] = []
  let cursor: string | null = null
  for (let page = 0; page < step.maxPages; page++) {
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
    rows.push(...result.page.map((record) => record.values))
    checkBudget(rows, limits)
    if (result.isDone) return rows
    cursor = result.continueCursor
  }
  throw new Error("Saved query has more pages than maxPages")
}
