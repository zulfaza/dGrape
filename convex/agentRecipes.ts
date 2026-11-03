import { validateRecipe } from "./lib/recipeDomain"
import { ConvexError, v } from "convex/values"
import { internalMutation, type MutationCtx } from "./_generated/server"
import { resolveGrant } from "./lib/agentGrant"
import * as recipes from "./recipes"

// Credential checks and the operation share one transaction.
async function withGrant<A>(
  ctx: MutationCtx,
  digest: string,
  access: "read" | "write",
  operate: (
    grant: NonNullable<Awaited<ReturnType<typeof resolveGrant>>>
  ) => Promise<A>
): Promise<A> {
  const grant = await resolveGrant(ctx, digest, Date.now())
  if (!grant || (access === "write" && grant.scope !== "readwrite"))
    throw new ConvexError({ status: 403, message: "Credential access denied" })
  try {
    return await operate(grant)
  } catch (error) {
    if (error instanceof ConvexError || !(error instanceof Error)) throw error
    throw new ConvexError({
      status: error.message.includes("denied") ? 403 : 400,
      message: error.message,
    })
  }
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
  },
  returns: recipes.publishResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, "write", async (grant) => {
      validateRecipe(args.recipe)
      for (const step of args.recipe.steps) {
        if (step.kind === "fetch") {
          const id = ctx.db.normalizeId("connections", step.connectionId)
          const connection = id ? await ctx.db.get(id) : null
          if (!connection || connection.workspaceId !== grant.workspaceId)
            throw new Error("Connection access denied")
        }
        if (step.kind === "upsert" || step.kind === "snapshot") {
          const id = ctx.db.normalizeId("collections", step.collectionId)
          const collection = id ? await ctx.db.get(id) : null
          if (!collection || collection.workspaceId !== grant.workspaceId)
            throw new Error("Output collection access denied")
        }
      }
      const { digest, ...input } = args
      void digest
      return recipes.publishForPrincipal(
        ctx,
        { ...input, workspaceId: grant.workspaceId },
        grant.owner
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
    withGrant(ctx, args.digest, "read", async (grant) => {
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
    withGrant(ctx, args.digest, "read", async (grant) => {
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
    withGrant(ctx, args.digest, "read", async (grant) => {
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
    withGrant(ctx, args.digest, "write", async (grant) => {
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
    withGrant(ctx, args.digest, "write", async (grant) => {
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
    withGrant(ctx, args.digest, "read", async (grant) => {
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
    withGrant(ctx, args.digest, "write", async (grant) => {
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
export const cancel = internalMutation({
  args: { digest: v.string(), ...recipes.cancelArgs.fields, runId: v.string() },
  returns: recipes.cancelResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, "write", async (grant) => {
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
export const setRunAccess = internalMutation({
  args: {
    digest: v.string(),
    ...recipes.setRunAccessArgs.fields,
    versionId: v.string(),
  },
  returns: recipes.setRunAccessResult,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, "write", async (grant) => {
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
