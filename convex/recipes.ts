import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { recipeTables } from "./lib/recipeState"
import { requireMembership } from "./lib/auth"
import { recipeValidator, validateRecipe } from "./lib/recipeDomain"
import {
  latestDue,
  nextOccurrence,
  occurrenceId,
  recipeTimingValidator,
  validateTiming,
} from "./lib/recipeSchedule"

/** A bounded output token detects writes made while a recipe fetches data. */
export async function recipeOutputToken(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  collectionId: string
) {
  const id = ctx.db.normalizeId("collections", collectionId)
  const collection = id ? await ctx.db.get(id) : null
  if (!collection || collection.workspaceId !== workspaceId)
    throw new Error("Output collection access denied")
  const records = await ctx.db
    .query("collectionRecords")
    .withIndex("by_collection", (q) => q.eq("collectionId", collection._id))
    .take(101)
  if (records.length > 100)
    throw new Error("Recipe output permits at most 100 existing rows")
  const publication = await ctx.db
    .query("snapshotPublications")
    .withIndex("by_collectionId", (q) => q.eq("collectionId", collection._id))
    .unique()
  return JSON.stringify({
    definition: collection.definition,
    records: records.map((r) => [r._id, r.revision]),
    generation: publication?.generation ?? null,
  })
}

async function requireRecipeAccess(
  ctx: MutationCtx,
  version: Doc<"recipeVersions">,
  operation: "run" | "manage"
) {
  const member = await requireMembership(ctx, version.workspaceId)
  if (member.userId === version.createdBy) return
  if (operation === "run") {
    const grant = await ctx.db
      .query("recipeRunGrants")
      .withIndex("by_versionId_and_userId", (q) =>
        q.eq("versionId", version._id).eq("userId", member.userId)
      )
      .unique()
    if (grant) return
  }
  throw new Error("Recipe permission denied")
}

export const setRunAccess = mutation({
  args: {
    versionId: v.id("recipeVersions"),
    userId: v.string(),
    allowed: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId)
    if (!version) throw new Error("Recipe not found")
    await requireRecipeAccess(ctx, version, "manage")
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", version.workspaceId).eq("userId", args.userId)
      )
      .unique()
    if (!member) throw new Error("Workspace member not found")
    const grant = await ctx.db
      .query("recipeRunGrants")
      .withIndex("by_versionId_and_userId", (q) =>
        q.eq("versionId", version._id).eq("userId", args.userId)
      )
      .unique()
    if (args.allowed && !grant)
      await ctx.db.insert("recipeRunGrants", {
        versionId: version._id,
        userId: args.userId,
      })
    if (!args.allowed && grant) await ctx.db.delete(grant._id)
    return null
  },
})

const LEASE_MS = 120_000
const ACTIVE_LIMIT = 4
const terminal = (run: Doc<"recipeRuns">) =>
  run.state !== "pending" && run.state !== "running"

export const publish = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    recipe: recipeValidator,
  },
  returns: v.id("recipeVersions"),
  handler: async (ctx, args) => {
    const member = await requireMembership(ctx, args.workspaceId)
    validateRecipe(args.recipe)
    if (!args.name.trim() || args.name.length > 120)
      throw new Error("Recipe name must be 1 to 120 characters")
    return ctx.db.insert("recipeVersions", {
      ...args,
      name: args.name.trim(),
      createdBy: member.userId,
    })
  },
})
export const versions = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      ...recipeTables.recipeVersions.validator.fields,
      _id: v.id("recipeVersions"),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId)
    return ctx.db
      .query("recipeVersions")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate(args.paginationOpts)
  },
})
export const runs = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      ...recipeTables.recipeRuns.validator.fields,
      _id: v.id("recipeRuns"),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId)
    return ctx.db
      .query("recipeRuns")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate(args.paginationOpts)
  },
})
export const history = query({
  args: { runId: v.id("recipeRuns"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(
    v.object({
      ...recipeTables.recipeStepAttempts.validator.fields,
      _id: v.id("recipeStepAttempts"),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error("Run not found")
    await requireMembership(ctx, run.workspaceId)
    return ctx.db
      .query("recipeStepAttempts")
      .withIndex("by_runId_and_step", (q) => q.eq("runId", args.runId))
      .paginate(args.paginationOpts)
  },
})

async function enqueue(
  ctx: MutationCtx,
  version: Doc<"recipeVersions">,
  key: string,
  scheduleId?: Id<"recipeSchedules">
) {
  const existing = await ctx.db
    .query("recipeRuns")
    .withIndex("by_workspaceId_and_key", (q) =>
      q.eq("workspaceId", version.workspaceId).eq("key", key)
    )
    .unique()
  if (existing) {
    if (existing.versionId !== version._id)
      throw new Error("Idempotency key belongs to another recipe version")
    return existing._id
  }
  return ctx.db.insert("recipeRuns", {
    workspaceId: version.workspaceId,
    versionId: version._id,
    scheduleId,
    key,
    state: "pending",
    cancelRequested: false,
    leaseUntil: 0,
    epoch: 0,
    nextStep: 0,
  })
}
export const trigger = mutation({
  args: { versionId: v.id("recipeVersions"), idempotencyKey: v.string() },
  returns: v.id("recipeRuns"),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId)
    if (!version) throw new Error("Recipe not found")
    await requireRecipeAccess(ctx, version, "run")
    if (!args.idempotencyKey || args.idempotencyKey.length > 200)
      throw new Error("Idempotency key must be 1 to 200 characters")
    return enqueue(ctx, version, `manual:${args.idempotencyKey}`)
  },
})
export const schedule = mutation({
  args: { versionId: v.id("recipeVersions"), timing: recipeTimingValidator },
  returns: v.id("recipeSchedules"),
  handler: async (ctx, args) => {
    const version = await ctx.db.get(args.versionId)
    if (!version) throw new Error("Recipe not found")
    await requireRecipeAccess(ctx, version, "manage")
    validateTiming(args.timing)
    const nextAt = nextOccurrence(args.timing, Date.now())
    if (nextAt === null) throw new Error("Schedule must be in the future")
    return ctx.db.insert("recipeSchedules", {
      workspaceId: version.workspaceId,
      ...args,
      enabled: true,
      nextAt,
    })
  },
})
export const schedules = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      ...recipeTables.recipeSchedules.validator.fields,
      _id: v.id("recipeSchedules"),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId)
    return ctx.db
      .query("recipeSchedules")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .paginate(args.paginationOpts)
  },
})
export const setEnabled = mutation({
  args: { scheduleId: v.id("recipeSchedules"), enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.scheduleId)
    if (!item) throw new Error("Schedule not found")
    const version = await ctx.db.get(item.versionId)
    if (!version) throw new Error("Recipe not found")
    await requireRecipeAccess(ctx, version, "manage")
    if (args.enabled === item.enabled) return null
    const nextAt = args.enabled
      ? nextOccurrence(item.timing, Date.now())
      : item.nextAt
    if (nextAt === null) throw new Error("One-off schedule has ended")
    await ctx.db.patch(item._id, { enabled: args.enabled, nextAt })
    return null
  },
})
export const cancel = mutation({
  args: { runId: v.id("recipeRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run) throw new Error("Run not found")
    const version = await ctx.db.get(run.versionId)
    if (!version) throw new Error("Recipe not found")
    await requireRecipeAccess(ctx, version, "run")
    if (!terminal(run))
      await ctx.db.patch(
        run._id,
        run.state === "pending"
          ? {
              cancelRequested: true,
              state: "cancelled",
              finishedAt: Date.now(),
            }
          : { cancelRequested: true }
      )
    return null
  },
})

/** Called by the one Cloudflare dispatcher. No Convex cron is registered. */
export const dispatch = internalMutation({
  args: {},
  returns: v.array(
    v.object({
      ...recipeTables.recipeRuns.validator.fields,
      _id: v.id("recipeRuns"),
      _creationTime: v.number(),
    })
  ),
  handler: async (ctx) => {
    const now = Date.now()
    const due = await ctx.db
      .query("recipeSchedules")
      .withIndex("by_enabled_and_nextAt", (q) =>
        q.eq("enabled", true).lte("nextAt", now)
      )
      .take(16)
    for (const item of due) {
      const at = latestDue(item.timing, item.nextAt, now)
      if (at === null) continue
      const version = await ctx.db.get(item.versionId)
      if (!version) throw new Error("Recipe not found")
      const active = item.activeRunId
        ? await ctx.db.get(item.activeRunId)
        : null
      const runId = await enqueue(
        ctx,
        version,
        occurrenceId(item._id, at),
        item._id
      )
      if (active && !terminal(active))
        await ctx.db.patch(runId, { state: "skipped", finishedAt: now })
      const next = nextOccurrence(item.timing, now)
      await ctx.db.patch(item._id, {
        enabled: next !== null,
        nextAt: next ?? item.nextAt,
        activeRunId: active && !terminal(active) ? active._id : runId,
      })
    }
    const pending = await ctx.db
      .query("recipeRuns")
      .withIndex("by_state_and_leaseUntil", (q) =>
        q.eq("state", "pending").lte("leaseUntil", now)
      )
      .take(16)
    const running = await ctx.db
      .query("recipeRuns")
      .withIndex("by_state_and_leaseUntil", (q) => q.eq("state", "running"))
      .take(ACTIVE_LIMIT)
    const leased = await ctx.db
      .query("recipeRuns")
      .withIndex("by_state_and_leaseUntil", (q) =>
        q.eq("state", "pending").gt("leaseUntil", now)
      )
      .take(ACTIVE_LIMIT)
    const capacity = Math.max(0, ACTIVE_LIMIT - running.length - leased.length)
    const claimed: Doc<"recipeRuns">[] = []
    for (const run of pending.slice(0, capacity)) {
      const patch = { leaseUntil: now + LEASE_MS, epoch: run.epoch + 1 }
      await ctx.db.patch(run._id, patch)
      claimed.push({ ...run, ...patch })
    }
    return claimed
  },
})

const runDocument = v.object({
  ...recipeTables.recipeRuns.validator.fields,
  _id: v.id("recipeRuns"),
  _creationTime: v.number(),
})
/** Workflow creation is at least once. Re-entering the same run never resets progress. */
export const begin = internalMutation({
  args: { runId: v.id("recipeRuns"), epoch: v.number() },
  returns: v.union(runDocument, v.null()),
  handler: async (ctx, { runId, epoch }) => {
    const run = await ctx.db.get(runId)
    if (!run || terminal(run)) return null
    const now = Date.now()
    if (
      run.epoch !== epoch ||
      (run.state === "pending" && run.leaseUntil <= now)
    )
      throw new Error("Run lease is stale")
    if (run.cancelRequested) {
      await ctx.db.patch(runId, { state: "cancelled", finishedAt: now })
      return null
    }
    if (run.state === "running") return run
    const version = await ctx.db.get(run.versionId)
    if (!version) throw new Error("Recipe missing")
    const output = version.recipe.steps.at(-1)
    const outputToken =
      output && (output.kind === "upsert" || output.kind === "snapshot")
        ? await recipeOutputToken(ctx, run.workspaceId, output.collectionId)
        : undefined
    const patch = {
      outputToken,
      state: "running",
      startedAt: now,
      leaseUntil: now + LEASE_MS,
    } satisfies Partial<Doc<"recipeRuns">>
    await ctx.db.patch(runId, patch)
    return { ...run, ...patch }
  },
})
export async function runningRun(
  ctx: MutationCtx,
  runId: Id<"recipeRuns">,
  epoch: number
) {
  const run = await ctx.db.get(runId)
  if (!run || run.state !== "running" || run.epoch !== epoch)
    throw new Error("Run lease is stale")
  return run
}
export const startStep = internalMutation({
  args: { runId: v.id("recipeRuns"), epoch: v.number(), step: v.number() },
  returns: v.union(
    v.object({ state: v.literal("started"), attempt: v.number() }),
    v.object({ state: v.literal("done") }),
    v.object({ state: v.literal("cancelled") })
  ),
  handler: async (
    ctx,
    args
  ): Promise<
    | { state: "started"; attempt: number }
    | { state: "done" }
    | { state: "cancelled" }
  > => {
    const run = await runningRun(ctx, args.runId, args.epoch)
    const now = Date.now()
    if (run.cancelRequested) {
      await ctx.db.patch(run._id, { state: "cancelled", finishedAt: now })
      return { state: "cancelled" }
    }
    if (args.step < run.nextStep) return { state: "done" }
    if (args.step !== run.nextStep) throw new Error("Steps must run in order")
    const version = await ctx.db.get(run.versionId)
    if (!version || args.step >= version.recipe.steps.length)
      throw new Error("Invalid recipe step")
    if (
      !run.startedAt ||
      now - run.startedAt > version.recipe.limits.durationMs
    ) {
      await ctx.db.patch(run._id, { state: "failed", finishedAt: now })
      return { state: "cancelled" }
    }
    const attempts = await ctx.db
      .query("recipeStepAttempts")
      .withIndex("by_runId_and_step", (q) =>
        q.eq("runId", run._id).eq("step", args.step)
      )
      .take(6)
    if (attempts.length >= version.recipe.limits.attempts) {
      await ctx.db.patch(run._id, { state: "failed", finishedAt: now })
      return { state: "cancelled" }
    }
    for (const prior of attempts)
      if (prior.state === "started")
        await ctx.db.patch(prior._id, {
          state: "failed",
          error: "Step failed",
          finishedAt: now,
        })
    const attempt = attempts.length + 1
    await ctx.db.insert("recipeStepAttempts", {
      runId: run._id,
      step: args.step,
      attempt,
      state: "started",
      startedAt: now,
    })
    await ctx.db.patch(run._id, { leaseUntil: now + LEASE_MS })
    return { state: "started", attempt }
  },
})
/** Checkpoint commits will share the output-save transaction in the runtime layer. */
export const failStep = internalMutation({
  args: {
    runId: v.id("recipeRuns"),
    epoch: v.number(),
    step: v.number(),
    attempt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await runningRun(ctx, args.runId, args.epoch)
    const attempts = await ctx.db
      .query("recipeStepAttempts")
      .withIndex("by_runId_and_step", (q) =>
        q.eq("runId", run._id).eq("step", args.step)
      )
      .take(6)
    const attempt = attempts.find((item) => item.attempt === args.attempt)
    if (attempt?.state === "started")
      await ctx.db.patch(attempt._id, {
        state: "failed",
        error: "Step failed",
        finishedAt: Date.now(),
      })
    return null
  },
})
