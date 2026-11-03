import { v } from "convex/values"
import { makeFunctionReference } from "convex/server"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { executionArgs } from "./recipeExecution"
import { transform, checkBudget, type RecipeRow } from "./lib/recipeDomain"
import { r2 } from "./lib/r2"
import type { Id } from "./_generated/dataModel"

type FetchArgs = {
  workspaceId: Id<"workspaces">
  connectionId: string
  principalUserId: string
  route: string
  method: "GET"
  query: Record<string, string>
  cursor: string | null
  limits: { maxRows: number; maxBytes: number }
}
type FetchResult = {
  rows: RecipeRow[]
  nextCursor: string | null
  bytesRead: number
}
// The connector sibling owns this function; this is its agreed transport contract.
const fetchPage = makeFunctionReference<"action", FetchArgs, FetchResult>(
  "connectors:fetchPage"
)
export const execute = internalAction({
  args: executionArgs,
  returns: v.null(),
  handler: async (ctx, args) => {
    const plan = await ctx.runQuery(internal.recipeExecution.inspect, {
      runId: args.runId,
      epoch: args.epoch,
    })
    if (!plan) return null
    const state = await ctx.runMutation(internal.recipes.startStep, args)
    if (state.state !== "started") return null
    try {
      const step = plan.recipe.steps[args.step]
      if (!step) throw new Error("Invalid recipe step")
      const input = await ctx.runQuery(
        internal.recipeExecution.checkpoint,
        args
      )
      let rows = input.rows
      let sourceCursor = input.sourceCursor
      let artifactKey: string | undefined
      if (step.kind === "fetch") {
        rows = []
        sourceCursor = plan.sourceCursor
        let cursor = sourceCursor || null
        const fetchStarted = Date.now()
        let bytes = 0
        const seen = new Set<string>()
        for (let page = 0; page < step.maxPages; page++) {
          if (Date.now() - fetchStarted > 60000)
            throw new Error("Recipe fetch duration exceeded")
          const result: FetchResult = await ctx.runAction(fetchPage, {
            workspaceId: plan.workspaceId,
            connectionId: step.connectionId,
            principalUserId: plan.createdBy,
            route: step.route,
            method: "GET",
            query: {},
            cursor,
            limits: {
              maxRows: plan.recipe.limits.rows,
              maxBytes: plan.recipe.limits.bytes,
            },
          })
          bytes += result.bytesRead
          if (bytes > plan.recipe.limits.bytes)
            throw new Error("Recipe fetch byte limit exceeded")
          rows.push(...result.rows)
          checkBudget(rows, plan.recipe.limits)
          if (result.nextCursor === null) break
          if (seen.has(result.nextCursor))
            throw new Error("Connector cursor repeated")
          seen.add(result.nextCursor)
          cursor = result.nextCursor
          if (page === step.maxPages - 1)
            throw new Error("Recipe pagination is incomplete")
        }
      } else if (step.kind === "artifact") {
        artifactKey = `workspaces/${plan.workspaceId}/recipes/${args.runId}/${args.epoch}/${args.step}/${state.attempt}`
        await r2.store(
          ctx,
          new Blob([JSON.stringify(rows)], { type: "application/json" }),
          { key: artifactKey, type: "application/json" }
        )
      } else if (step.kind !== "upsert" && step.kind !== "snapshot")
        rows = transform(rows, step, plan.recipe.limits)
      await ctx.runMutation(internal.recipeExecution.commit, {
        ...args,
        attempt: state.attempt,
        rows,
        sourceCursor,
        artifactKey,
      })
    } catch {
      await ctx.runMutation(internal.recipes.failStep, {
        ...args,
        attempt: state.attempt,
      })
      throw new Error("Step failed")
    }
    return null
  },
})
