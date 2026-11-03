import { ConvexError, v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import * as recipes from "./recipes"

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
  },
  returns: recipes.publishResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      await recipes.checkRecipe(ctx, grant.workspaceId, args.recipe)
      const { digest, ...input } = args
      void digest
      return recipes.publishForPrincipal(
        ctx,
        { ...input, workspaceId: grant.workspaceId },
        grant.owner
      )
    }),
})
export const validate = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    ...recipes.validateArgs.omit("workspaceId").fields,
  },
  returns: recipes.validateResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, "read", async (grant) =>
      recipes.validateForPrincipal(
        ctx,
        { recipe: args.recipe, workspaceId: grant.workspaceId },
        grant.owner
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
    withGrant(ctx, args.digest, args.now, "read", async (grant) =>
      recipes.previewForPrincipal(
        ctx,
        {
          recipe: args.recipe,
          sample: args.sample,
          workspaceId: grant.workspaceId,
        },
        grant.owner
      )
    ),
})
export const versions = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.versionsArgs.omit("workspaceId").fields,
  },
  returns: recipes.versionsResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "read", async (grant) => {
      const { digest, ...input } = args
      void digest
      checkPage(input.paginationOpts)
      return recipes.versionsForPrincipal(
        ctx,
        { ...input, workspaceId: grant.workspaceId },
        grant.owner
      )
    }),
})
export const runs = internalMutation({
  args: { digest: v.string(), ...recipes.runsArgs.omit("workspaceId").fields },
  returns: recipes.runsResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "read", async (grant) => {
      const { digest, ...input } = args
      void digest
      checkPage(input.paginationOpts)
      return recipes.runsForPrincipal(
        ctx,
        { ...input, workspaceId: grant.workspaceId },
        grant.owner
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
    withGrant(ctx, args.digest, Date.now(), "read", async (grant) => {
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
      return recipes.historyForPrincipal(ctx, { ...input, runId }, grant.owner)
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
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const { digest, ...input } = args
      void digest
      const versionId = ctx.db.normalizeId("recipeVersions", input.versionId)
      const document = versionId ? await ctx.db.get(versionId) : null
      if (!versionId || !document || document.workspaceId !== grant.workspaceId)
        throw new ConvexError({
          status: 403,
          message: "Workspace access denied",
        })
      return recipes.triggerForPrincipal(
        ctx,
        { ...input, versionId },
        grant.owner
      )
    }),
})
export const schedule = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.scheduleArgs.fields,
    versionId: v.string(),
  },
  returns: recipes.scheduleResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const { digest, ...input } = args
      void digest
      const versionId = ctx.db.normalizeId("recipeVersions", input.versionId)
      const document = versionId ? await ctx.db.get(versionId) : null
      if (!versionId || !document || document.workspaceId !== grant.workspaceId)
        throw new ConvexError({
          status: 403,
          message: "Workspace access denied",
        })
      return recipes.scheduleForPrincipal(
        ctx,
        { ...input, versionId },
        grant.owner
      )
    }),
})
export const schedules = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.schedulesArgs.omit("workspaceId").fields,
  },
  returns: recipes.schedulesResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "read", async (grant) => {
      const { digest, ...input } = args
      void digest
      checkPage(input.paginationOpts)
      return recipes.schedulesForPrincipal(
        ctx,
        { ...input, workspaceId: grant.workspaceId },
        grant.owner
      )
    }),
})
export const setEnabled = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.setEnabledArgs.fields,
    scheduleId: v.string(),
  },
  returns: recipes.setEnabledResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const { digest, ...input } = args
      void digest
      const scheduleId = ctx.db.normalizeId("recipeSchedules", input.scheduleId)
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
      return recipes.setEnabledForPrincipal(
        ctx,
        { ...input, scheduleId },
        grant.owner
      )
    }),
})
export const updateSchedule = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.updateScheduleArgs.fields,
    scheduleId: v.string(),
    versionId: v.string(),
  },
  returns: recipes.updateScheduleResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const { digest, ...input } = args
      void digest
      const scheduleId = ctx.db.normalizeId("recipeSchedules", input.scheduleId)
      const versionId = ctx.db.normalizeId("recipeVersions", input.versionId)
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
      return recipes.updateScheduleForPrincipal(
        ctx,
        { ...input, scheduleId, versionId },
        grant.owner
      )
    }),
})
export const cancel = internalMutation({
  args: { digest: v.string(), ...recipes.cancelArgs.fields, runId: v.string() },
  returns: recipes.cancelResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const { digest, ...input } = args
      void digest
      const runId = ctx.db.normalizeId("recipeRuns", input.runId)
      const document = runId ? await ctx.db.get(runId) : null
      if (!runId || !document || document.workspaceId !== grant.workspaceId)
        throw new ConvexError({
          status: 403,
          message: "Workspace access denied",
        })
      return recipes.cancelForPrincipal(ctx, { ...input, runId }, grant.owner)
    }),
})
export const retry = internalMutation({
  args: { digest: v.string(), ...recipes.retryArgs.fields, runId: v.string() },
  returns: recipes.retryResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const { digest, ...input } = args
      void digest
      const runId = ctx.db.normalizeId("recipeRuns", input.runId)
      const document = runId ? await ctx.db.get(runId) : null
      if (!runId || !document || document.workspaceId !== grant.workspaceId)
        throw new ConvexError({
          status: 403,
          message: "Workspace access denied",
        })
      return recipes.retryForPrincipal(ctx, { ...input, runId }, grant.owner)
    }),
})
export const setRunAccess = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.setRunAccessArgs.fields,
    versionId: v.string(),
  },
  returns: recipes.setRunAccessResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const { digest, ...input } = args
      void digest
      const versionId = ctx.db.normalizeId("recipeVersions", input.versionId)
      const document = versionId ? await ctx.db.get(versionId) : null
      if (!versionId || !document || document.workspaceId !== grant.workspaceId)
        throw new ConvexError({
          status: 403,
          message: "Workspace access denied",
        })
      return recipes.setRunAccessForPrincipal(
        ctx,
        { ...input, versionId },
        grant.owner
      )
    }),
})
