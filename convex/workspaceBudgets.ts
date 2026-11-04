import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { artifactUsageValidator, usageRow } from "./lib/artifactUsage"
import { recordAuditEvent } from "./lib/auditEvents"
import { requireMembership } from "./lib/auth"
import {
  budgetOverridesValidator,
  budgetsValidator,
  checkBudgetOverrides,
  effectiveBudgets,
} from "./lib/budgets"
import { recordCountValidator } from "./lib/recordCounts"

/** The usage report reads at most this many collections and recent runs. */
const USAGE_COLLECTIONS = 100
const USAGE_RUNS = 20

/** The budgets the owner changed, and the budgets that apply. */
export const get = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    overrides: budgetOverridesValidator,
    budgets: budgetsValidator,
  }),
  handler: async (ctx, { workspaceId }) => {
    await requireMembership(ctx, workspaceId, "read")
    const workspace = await ctx.db.get(workspaceId)
    if (!workspace) throw new Error("Workspace not found")
    const overrides = workspace.budgets ?? {}
    return { overrides, budgets: effectiveBudgets(overrides) }
  },
})

/**
 * Replaces the owner's budget overrides. A budget left out goes back to its
 * default. A lower budget stops only new work; existing data stays.
 */
export const set = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    overrides: budgetOverridesValidator,
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, overrides }) => {
    const member = await requireMembership(ctx, workspaceId, "manage")
    const checked = checkBudgetOverrides(overrides)
    if (!checked.ok) throw new Error(checked.message)
    await ctx.db.patch(workspaceId, { budgets: checked.value })
    await recordAuditEvent(
      ctx,
      workspaceId,
      { kind: "user", userId: member.userId },
      { operation: "workspace.setBudgets", overrides: checked.value }
    )
    return null
  },
})

/**
 * What the workspace uses, next to its budgets. A count that is still being
 * scanned is a lower bound ("counting"); null means no scan has started yet.
 */
export const usage = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    collections: v.array(
      v.object({
        collectionId: v.id("collections"),
        name: v.string(),
        records: v.union(recordCountValidator, v.null()),
        indexedFields: v.number(),
      })
    ),
    moreCollections: v.boolean(),
    artifacts: v.union(artifactUsageValidator, v.null()),
    recentRuns: v.object({
      count: v.number(),
      mostSteps: v.union(v.number(), v.null()),
      longestMs: v.union(v.number(), v.null()),
    }),
  }),
  handler: async (ctx, { workspaceId }) => {
    await requireMembership(ctx, workspaceId, "read")
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(USAGE_COLLECTIONS + 1)
    const runs = await ctx.db
      .query("recipeRuns")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .take(USAGE_RUNS)
    let mostSteps: number | null = null
    let longestMs: number | null = null
    for (const run of runs) {
      const version = await ctx.db.get(run.versionId)
      if (version)
        mostSteps = Math.max(mostSteps ?? 0, version.recipe.steps.length)
      if (run.startedAt !== undefined && run.finishedAt !== undefined)
        longestMs = Math.max(longestMs ?? 0, run.finishedAt - run.startedAt)
    }
    return {
      collections: collections.slice(0, USAGE_COLLECTIONS).map((c) => ({
        collectionId: c._id,
        name: c.name,
        records: c.recordCount ?? null,
        indexedFields: c.definition.fields.filter((f) => f.indexed).length,
      })),
      moreCollections: collections.length > USAGE_COLLECTIONS,
      artifacts: (await usageRow(ctx, workspaceId))?.artifacts ?? null,
      recentRuns: { count: runs.length, mostSteps, longestMs },
    }
  },
})
