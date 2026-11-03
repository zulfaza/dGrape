import { v, type Infer } from "convex/values"
import type { Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { MAX_INDEXED_FIELDS, type Checked } from "./collectionDomain"

/**
 * Per-workspace budgets. A workspace stores only the budgets its owner
 * changed (`workspaces.budgets`); each other budget has its default.
 *
 * `max` is the platform ceiling: the fixed limit in code. An owner can lower
 * a budget below its ceiling but cannot raise it above. A lower budget stops
 * only new work. It never deletes data that is already there.
 *
 * To add a budget: add it to `budgetsValidator`, `BUDGET_SPECS` and
 * `effectiveBudgets`, and enforce it before the work starts.
 */
export const budgetsValidator = v.object({
  indexedFieldsPerCollection: v.number(),
  queryRowsRead: v.number(),
  queryBytesRead: v.number(),
})
export const budgetOverridesValidator = budgetsValidator.partial()

export type Budgets = Infer<typeof budgetsValidator>
export type BudgetOverrides = Infer<typeof budgetOverridesValidator>
export type BudgetKey = keyof Budgets

export type BudgetSpec = {
  readonly label: string
  readonly unit: "count" | "bytes"
  readonly min: number
  readonly default: number
  readonly max: number
}

export const BUDGET_SPECS = {
  indexedFieldsPerCollection: {
    label: "Indexed fields per collection",
    unit: "count",
    min: 0,
    default: MAX_INDEXED_FIELDS,
    max: MAX_INDEXED_FIELDS,
  },
  queryRowsRead: {
    label: "Rows read per query page",
    unit: "count",
    min: 1,
    default: 100,
    max: 100,
  },
  queryBytesRead: {
    label: "Bytes read per query page",
    unit: "bytes",
    min: 1,
    default: 1_000_000,
    max: 1_000_000,
  },
} satisfies { readonly [K in BudgetKey]: BudgetSpec }

const isBudgetKey = (key: string): key is BudgetKey =>
  Object.hasOwn(BUDGET_SPECS, key)

export const BUDGET_KEYS: ReadonlyArray<BudgetKey> =
  Object.keys(BUDGET_SPECS).filter(isBudgetKey)

/** The override, or the default. A stored value above the ceiling is capped. */
function budget(overrides: BudgetOverrides | undefined, key: BudgetKey) {
  const spec = BUDGET_SPECS[key]
  return Math.min(overrides?.[key] ?? spec.default, spec.max)
}

export function effectiveBudgets(
  overrides: BudgetOverrides | undefined
): Budgets {
  return {
    indexedFieldsPerCollection: budget(overrides, "indexedFieldsPerCollection"),
    queryRowsRead: budget(overrides, "queryRowsRead"),
    queryBytesRead: budget(overrides, "queryBytesRead"),
  }
}

/** Checks that each override is an integer from its minimum to its ceiling. */
export function checkBudgetOverrides(
  overrides: BudgetOverrides
): Checked<BudgetOverrides> {
  for (const key of BUDGET_KEYS) {
    const value = overrides[key]
    if (value === undefined) continue
    const { label, min, max } = BUDGET_SPECS[key]
    if (!Number.isSafeInteger(value) || value < min || value > max)
      return {
        ok: false,
        message: `${label} must be an integer from ${min} to ${max}`,
      }
  }
  return { ok: true, value: overrides }
}

/** The budgets of a workspace. Callers check access first. */
export async function workspaceBudgets(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">
): Promise<Budgets> {
  const workspace = await ctx.db.get(workspaceId)
  if (!workspace) throw new Error("Workspace not found")
  return effectiveBudgets(workspace.budgets)
}
