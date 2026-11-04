import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { withGrant, type Grant } from "./lib/agentGrant"
import {
  missingScopeMessage,
  missingScopes,
  type AgentScope,
} from "./lib/agentScope"
import type { Recipe } from "./lib/recipeDomain"
import { agentOperation, runOnce } from "./lib/operations"
import * as recipes from "./recipes"

function requireScopes(grant: Grant, needed: ReadonlyArray<AgentScope>) {
  const missing = missingScopes(grant.scopes, needed)
  if (missing.length > 0)
    throw new ConvexError({
      status: 403,
      message: missingScopeMessage(missing),
    })
}
/** A query step reads records, so a preview of its rows needs `data.read`. */
function readScopes(recipe: Recipe): AgentScope[] {
  return recipe.steps.some((step) => step.kind === "query") ? ["data.read"] : []
}
/**
 * A recipe with a fetch step calls a connection, and a query step reads
 * records. Binding it to a recipe, or starting or scheduling its runs, also
 * needs `connections.use` or `data.read`.
 */
function requireRecipeScopes(grant: Grant, recipe: Recipe) {
  const needed = readScopes(recipe)
  if (recipe.steps.some((step) => step.kind === "fetch"))
    needed.push("connections.use")
  requireScopes(grant, needed)
}

function checkPage(input: { numItems: number; cursor: string | null }) {
  if (
    !Number.isSafeInteger(input.numItems) ||
    input.numItems < 1 ||
    input.numItems > 50 ||
    (input.cursor?.length ?? 0) > 4096
  )
    throw new ConvexError({ status: 400, message: "Invalid page" })
}
export const publish = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.publishArgs.omit("workspaceId").fields,
    idempotencyKey: v.optional(v.string()),
  },
  returns: recipes.publishResult,
  handler: (ctx, { digest, idempotencyKey, ...input }) =>
    withGrant(ctx, digest, Date.now(), ["jobs.manage"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "recipes.publish", idempotencyKey, input),
        recipes.publishResult,
        async () => {
          requireRecipeScopes(grant, input.recipe)
          await recipes.checkRecipe(ctx, grant.workspaceId, input.recipe)
          return recipes.publishForPrincipal(
            ctx,
            { ...input, workspaceId: grant.workspaceId },
            grant
          )
        }
      )
    ),
})
export const validate = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    ...recipes.validateArgs.omit("workspaceId").fields,
  },
  returns: recipes.validateResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, ["jobs.read"], async (grant) =>
      recipes.validateForPrincipal(
        ctx,
        { recipe: args.recipe, workspaceId: grant.workspaceId },
        grant
      )
    ),
})
export const preview = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    ...recipes.previewArgs.omit("workspaceId").fields,
  },
  returns: recipes.previewResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, ["jobs.read"], async (grant) => {
      requireScopes(grant, readScopes(args.recipe))
      return recipes.previewForPrincipal(
        ctx,
        {
          recipe: args.recipe,
          sample: args.sample,
          workspaceId: grant.workspaceId,
        },
        grant
      )
    }),
})
export const versions = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.versionsArgs.omit("workspaceId").fields,
  },
  returns: recipes.versionsResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["jobs.read"], async (grant) => {
      const { digest, ...input } = args
      void digest
      checkPage(input.paginationOpts)
      return recipes.versionsForPrincipal(
        ctx,
        { ...input, workspaceId: grant.workspaceId },
        grant
      )
    }),
})
export const runs = internalMutation({
  args: { digest: v.string(), ...recipes.runsArgs.omit("workspaceId").fields },
  returns: recipes.runsResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["jobs.read"], async (grant) => {
      const { digest, ...input } = args
      void digest
      checkPage(input.paginationOpts)
      return recipes.runsForPrincipal(
        ctx,
        { ...input, workspaceId: grant.workspaceId },
        grant
      )
    }),
})
export const history = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.historyArgs.fields,
    runId: v.string(),
  },
  returns: recipes.historyResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["jobs.read"], async (grant) => {
      const { digest, ...input } = args
      void digest
      checkPage(input.paginationOpts)
      const runId = ctx.db.normalizeId("recipeRuns", input.runId)
      const document = runId ? await ctx.db.get(runId) : null
      if (!runId || !document || document.workspaceId !== grant.workspaceId)
        throw new ConvexError({
          status: 403,
          message: "Workspace access denied",
        })
      return recipes.historyForPrincipal(ctx, { ...input, runId }, grant)
    }),
})
export const trigger = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.triggerArgs.fields,
    versionId: v.string(),
  },
  returns: recipes.triggerResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["jobs.run"], async (grant) => {
      const { digest, ...input } = args
      void digest
      const versionId = ctx.db.normalizeId("recipeVersions", input.versionId)
      const document = versionId ? await ctx.db.get(versionId) : null
      if (!versionId || !document || document.workspaceId !== grant.workspaceId)
        throw new ConvexError({
          status: 403,
          message: "Workspace access denied",
        })
      requireRecipeScopes(grant, document.recipe)
      return recipes.triggerForPrincipal(ctx, { ...input, versionId }, grant)
    }),
})
export const schedule = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.scheduleArgs.fields,
    versionId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  returns: recipes.scheduleResult,
  handler: (ctx, { digest, idempotencyKey, ...input }) =>
    withGrant(ctx, digest, Date.now(), ["jobs.manage"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "recipes.schedule", idempotencyKey, input),
        recipes.scheduleResult,
        async () => {
          const versionId = ctx.db.normalizeId(
            "recipeVersions",
            input.versionId
          )
          const document = versionId ? await ctx.db.get(versionId) : null
          if (
            !versionId ||
            !document ||
            document.workspaceId !== grant.workspaceId
          )
            throw new ConvexError({
              status: 403,
              message: "Workspace access denied",
            })
          requireRecipeScopes(grant, document.recipe)
          return recipes.scheduleForPrincipal(
            ctx,
            { ...input, versionId },
            grant
          )
        }
      )
    ),
})
export const schedules = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.schedulesArgs.omit("workspaceId").fields,
  },
  returns: recipes.schedulesResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["jobs.read"], async (grant) => {
      const { digest, ...input } = args
      void digest
      checkPage(input.paginationOpts)
      return recipes.schedulesForPrincipal(
        ctx,
        { ...input, workspaceId: grant.workspaceId },
        grant
      )
    }),
})
export const setEnabled = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.setEnabledArgs.fields,
    scheduleId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  returns: recipes.setEnabledResult,
  handler: (ctx, { digest, idempotencyKey, ...input }) =>
    withGrant(ctx, digest, Date.now(), ["jobs.manage"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "recipes.setEnabled", idempotencyKey, input),
        recipes.setEnabledResult,
        async () => {
          const scheduleId = ctx.db.normalizeId(
            "recipeSchedules",
            input.scheduleId
          )
          const document = scheduleId ? await ctx.db.get(scheduleId) : null
          if (
            !scheduleId ||
            !document ||
            document.workspaceId !== grant.workspaceId
          )
            throw new ConvexError({
              status: 403,
              message: "Workspace access denied",
            })
          if (input.enabled) {
            const version = await ctx.db.get(document.versionId)
            if (version) requireRecipeScopes(grant, version.recipe)
          }
          return recipes.setEnabledForPrincipal(
            ctx,
            { ...input, scheduleId },
            grant
          )
        }
      )
    ),
})
export const updateSchedule = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.updateScheduleArgs.fields,
    scheduleId: v.string(),
    versionId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  returns: recipes.updateScheduleResult,
  handler: (ctx, { digest, idempotencyKey, ...input }) =>
    withGrant(ctx, digest, Date.now(), ["jobs.manage"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "recipes.updateSchedule", idempotencyKey, input),
        recipes.updateScheduleResult,
        async () => {
          const scheduleId = ctx.db.normalizeId(
            "recipeSchedules",
            input.scheduleId
          )
          const versionId = ctx.db.normalizeId(
            "recipeVersions",
            input.versionId
          )
          const schedule = scheduleId ? await ctx.db.get(scheduleId) : null
          const version = versionId ? await ctx.db.get(versionId) : null
          if (
            !scheduleId ||
            !versionId ||
            !schedule ||
            !version ||
            schedule.workspaceId !== grant.workspaceId ||
            version.workspaceId !== grant.workspaceId
          )
            throw new ConvexError({
              status: 403,
              message: "Workspace access denied",
            })
          requireRecipeScopes(grant, version.recipe)
          return recipes.updateScheduleForPrincipal(
            ctx,
            { ...input, scheduleId, versionId },
            grant
          )
        }
      )
    ),
})
export const cancel = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.cancelArgs.fields,
    runId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  returns: recipes.cancelResult,
  handler: (ctx, { digest, idempotencyKey, ...input }) =>
    withGrant(ctx, digest, Date.now(), ["jobs.run"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "recipes.cancel", idempotencyKey, input),
        recipes.cancelResult,
        async () => {
          const runId = ctx.db.normalizeId("recipeRuns", input.runId)
          const document = runId ? await ctx.db.get(runId) : null
          if (!runId || !document || document.workspaceId !== grant.workspaceId)
            throw new ConvexError({
              status: 403,
              message: "Workspace access denied",
            })
          return recipes.cancelForPrincipal(ctx, { ...input, runId }, grant)
        }
      )
    ),
})
export const retry = internalMutation({
  args: { digest: v.string(), ...recipes.retryArgs.fields, runId: v.string() },
  returns: recipes.retryResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["jobs.run"], async (grant) => {
      const { digest, ...input } = args
      void digest
      const runId = ctx.db.normalizeId("recipeRuns", input.runId)
      const document = runId ? await ctx.db.get(runId) : null
      if (!runId || !document || document.workspaceId !== grant.workspaceId)
        throw new ConvexError({
          status: 403,
          message: "Workspace access denied",
        })
      const version = await ctx.db.get(document.versionId)
      if (version) requireRecipeScopes(grant, version.recipe)
      return recipes.retryForPrincipal(ctx, { ...input, runId }, grant)
    }),
})
export const setRunAccess = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.setRunAccessArgs.fields,
    versionId: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  returns: recipes.setRunAccessResult,
  handler: (ctx, { digest, idempotencyKey, ...input }) =>
    withGrant(ctx, digest, Date.now(), ["jobs.manage"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "recipes.setRunAccess", idempotencyKey, input),
        recipes.setRunAccessResult,
        async () => {
          const versionId = ctx.db.normalizeId(
            "recipeVersions",
            input.versionId
          )
          const document = versionId ? await ctx.db.get(versionId) : null
          if (
            !versionId ||
            !document ||
            document.workspaceId !== grant.workspaceId
          )
            throw new ConvexError({
              status: 403,
              message: "Workspace access denied",
            })
          return recipes.setRunAccessForPrincipal(
            ctx,
            { ...input, versionId },
            grant
          )
        }
      )
    ),
})
