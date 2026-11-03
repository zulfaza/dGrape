import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import {
  budgetOverridesValidator,
  budgetsValidator,
  checkBudgetOverrides,
  effectiveBudgets,
} from "./lib/budgets"

/** The budgets the owner changed, and the budgets that apply. */
export const get = query({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    overrides: budgetOverridesValidator,
    budgets: budgetsValidator,
  }),
  handler: async (ctx, { workspaceId }) => {
    await requireMembership(ctx, workspaceId)
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
    const member = await requireMembership(ctx, workspaceId)
    if (member.role !== "owner")
      throw new Error("Only the owner can change budgets")
    const checked = checkBudgetOverrides(overrides)
    if (!checked.ok) throw new Error(checked.message)
    await ctx.db.patch(workspaceId, { budgets: checked.value })
    return null
  },
})
