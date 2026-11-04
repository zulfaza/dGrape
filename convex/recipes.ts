import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v, type Infer } from "convex/values"
import {
  mutation,
  query,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import type { Doc, Id } from "./_generated/dataModel"
import { recipeTables } from "./lib/recipeState"
import { memberWithAccess, requireMembership } from "./lib/auth"
import { roleAllows, type WorkspaceAccess } from "./lib/workspaceRoles"
import { recipeBudgetProblem, workspaceBudgets } from "./lib/budgets"
import {
  checkRecordValues,
  recordValuesValidator,
} from "./lib/collectionDomain"
import {
  previewRecipe,
  recipePreviewValidator,
  recipeValidator,
  validateRecipe,
  type Recipe,
} from "./lib/recipeDomain"
import {
  auditActor,
  recordAuditEvent,
  type AgentPrincipal,
} from "./lib/auditEvents"
import {
  latestDue,
  nextOccurrence,
  occurrenceId,
  recipeTimingValidator,
  validateTiming,
} from "./lib/recipeSchedule"
import { recordSyncOutcome } from "./lib/sourceSync"
import { readJoinCollection, readQueryPage } from "./lib/recipeQuery"

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

/** The membership of the caller, or of the agent credential's owner. */
async function recipeMember(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  access: WorkspaceAccess,
  agent?: AgentPrincipal
) {
  if (agent === undefined) return requireMembership(ctx, workspaceId, access)
  const member = await memberWithAccess(ctx, workspaceId, agent.owner, access)
  if (!member) throw new Error("Workspace access denied")
  return member
}

async function requireRecipeAccess(
  ctx: MutationCtx,
  version: Doc<"recipeVersions">,
  operation: "run" | "manage",
  agent?: AgentPrincipal
) {
  // Running or managing a recipe changes workspace data.
  const member = await recipeMember(ctx, version.workspaceId, "write", agent)
  const actor = auditActor(member.userId, agent)
  if (member.userId === version.createdBy) return actor
  if (operation === "run") {
    const grant = await ctx.db
      .query("recipeRunGrants")
      .withIndex("by_versionId_and_userId", (q) =>
        q.eq("versionId", version._id).eq("userId", member.userId)
      )
      .unique()
    if (grant) return actor
  }
  throw new Error("Recipe permission denied")
}

export const setRunAccessArgs = v.object({
  versionId: v.id("recipeVersions"),
  userId: v.string(),
  allowed: v.boolean(),
})
export const setRunAccessResult = v.null()
export async function setRunAccessForPrincipal(
  ctx: MutationCtx,
  args: Infer<typeof setRunAccessArgs>,
  agent?: AgentPrincipal
) {
  const version = await ctx.db.get(args.versionId)
  if (!version) throw new Error("Recipe not found")
  const actor = await requireRecipeAccess(ctx, version, "manage", agent)
  // A run grant is useless to a member whose role cannot run recipes. A
  // grant can always be removed, also after the member lost access.
  if (
    args.allowed &&
    !(await memberWithAccess(ctx, version.workspaceId, args.userId, "write"))
  )
    throw new Error("Workspace member cannot run recipes")
  const grant = await ctx.db
    .query("recipeRunGrants")
    .withIndex("by_versionId_and_userId", (q) =>
      q.eq("versionId", version._id).eq("userId", args.userId)
    )
    .unique()
  if (args.allowed === (grant !== null)) return null
  if (args.allowed && !grant)
    await ctx.db.insert("recipeRunGrants", {
      versionId: version._id,
      userId: args.userId,
    })
  if (!args.allowed && grant) await ctx.db.delete(grant._id)
  await recordAuditEvent(ctx, version.workspaceId, actor, {
    operation: "recipe.setRunAccess",
    versionId: version._id,
    userId: args.userId,
    allowed: args.allowed,
  })
  return null
}
export const setRunAccess = mutation({
  args: setRunAccessArgs.fields,
  returns: setRunAccessResult,
  handler: (ctx, args) => setRunAccessForPrincipal(ctx, args),
})

const LEASE_MS = 120_000
const ACTIVE_LIMIT = 4
const terminal = (run: Doc<"recipeRuns">) =>
  run.state !== "pending" && run.state !== "running"

/** Checks the recipe and that its connections and output collection are in the workspace. Returns the output collection. */
export async function checkRecipe(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  recipe: Recipe
) {
  validateRecipe(recipe)
  const overBudget = recipeBudgetProblem(
    recipe,
    await workspaceBudgets(ctx, workspaceId)
  )
  if (overBudget) throw new Error(overBudget)
  let output: Doc<"collections"> | null = null
  for (const step of recipe.steps) {
    if (step.kind === "fetch") {
      const id = ctx.db.normalizeId("connections", step.connectionId)
      const connection = id ? await ctx.db.get(id) : null
      if (!connection || connection.workspaceId !== workspaceId)
        throw new Error("Connection access denied")
    }
    if (step.kind === "join" && "collectionId" in step) {
      const id = ctx.db.normalizeId("collections", step.collectionId)
      const collection = id ? await ctx.db.get(id) : null
      if (!collection || collection.workspaceId !== workspaceId)
        throw new Error("Join collection access denied")
    }
    if (step.kind === "query") {
      const id = ctx.db.normalizeId("queryDefinitions", step.queryId)
      const saved = id ? await ctx.db.get(id) : null
      if (!saved || saved.workspaceId !== workspaceId)
        throw new Error("Query access denied")
      const version = await ctx.db
        .query("queryDefinitionVersions")
        .withIndex("by_queryId_and_revision", (q) =>
          q.eq("queryId", saved._id).eq("revision", step.revision)
        )
        .unique()
      if (!version) throw new Error("Query revision mismatch")
    }
    if (step.kind === "upsert" || step.kind === "snapshot") {
      const id = ctx.db.normalizeId("collections", step.collectionId)
      output = id ? await ctx.db.get(id) : null
      if (!output || output.workspaceId !== workspaceId)
        throw new Error("Output collection access denied")
    }
  }
  return output
}
/** Recipe errors become a result. Access errors still throw. */
async function attempt<A extends { ok: true }>(
  operate: () => Promise<A>
): Promise<A | { ok: false; error: string }> {
  try {
    return await operate()
  } catch (error) {
    if (!(error instanceof Error)) throw error
    return { ok: false, error: error.message }
  }
}
const failedCheck = v.object({ ok: v.literal(false), error: v.string() })

export const validateArgs = v.object({
  workspaceId: v.id("workspaces"),
  recipe: recipeValidator,
})
export const validateResult = v.union(
  v.object({ ok: v.literal(true) }),
  failedCheck
)
export async function validateForPrincipal(
  ctx: QueryCtx,
  args: Infer<typeof validateArgs>,
  agent?: AgentPrincipal
) {
  await recipeMember(ctx, args.workspaceId, "write", agent)
  return attempt(async () => {
    await checkRecipe(ctx, args.workspaceId, args.recipe)
    return { ok: true as const }
  })
}
export const validate = query({
  args: validateArgs.fields,
  returns: validateResult,
  handler: (ctx, args) => validateForPrincipal(ctx, args),
})

export const previewArgs = v.object({
  ...validateArgs.fields,
  sample: v.array(recordValuesValidator),
})
export const previewResult = v.union(
  v.object({ ok: v.literal(true), ...recipePreviewValidator.fields }),
  failedCheck
)
/** A query, so the dry run cannot write records. */
export async function previewForPrincipal(
  ctx: QueryCtx,
  args: Infer<typeof previewArgs>,
  agent?: AgentPrincipal
) {
  await recipeMember(ctx, args.workspaceId, "write", agent)
  return attempt(async () => {
    const output = await checkRecipe(ctx, args.workspaceId, args.recipe)
    // Convex permits one paginated read per query, so a preview reads only
    // the first page of one query step, as a sample.
    let queried = false
    const preview = await previewRecipe(args.recipe, args.sample, {
      query: async (step) => {
        if (queried) throw new Error("A preview can read one query step")
        queried = true
        return (await readQueryPage(ctx, args.workspaceId, step, null)).rows
      },
      collection: (collectionId) =>
        readJoinCollection(
          ctx,
          args.workspaceId,
          collectionId,
          args.recipe.limits
        ),
    })
    if (output)
      for (const [index, row] of preview.rows.entries()) {
        const checked = checkRecordValues(output.definition.fields, row)
        if (!checked.ok)
          throw new Error(`Output row ${index + 1}: ${checked.message}`)
      }
    return { ok: true as const, ...preview }
  })
}
export const preview = query({
  args: previewArgs.fields,
  returns: previewResult,
  handler: (ctx, args) => previewForPrincipal(ctx, args),
})

export const publishArgs = v.object({
  workspaceId: v.id("workspaces"),
  name: v.string(),
  recipe: recipeValidator,
})
export const publishResult = v.id("recipeVersions")
export async function publishForPrincipal(
  ctx: MutationCtx,
  args: Infer<typeof publishArgs>,
  agent?: AgentPrincipal
) {
  const member = await recipeMember(ctx, args.workspaceId, "write", agent)
  validateRecipe(args.recipe)
  const overBudget = recipeBudgetProblem(
    args.recipe,
    await workspaceBudgets(ctx, args.workspaceId)
  )
  if (overBudget) throw new Error(overBudget)
  if (!args.name.trim() || args.name.length > 120)
    throw new Error("Recipe name must be 1 to 120 characters")
  const versionId = await ctx.db.insert("recipeVersions", {
    ...args,
    name: args.name.trim(),
    createdBy: member.userId,
  })
  await recordAuditEvent(
    ctx,
    args.workspaceId,
    auditActor(member.userId, agent),
    { operation: "recipe.publish", versionId }
  )
  return versionId
}
export const publish = mutation({
  args: publishArgs.fields,
  returns: publishResult,
  handler: (ctx, args) => publishForPrincipal(ctx, args),
})
export const versionsArgs = v.object({
  workspaceId: v.id("workspaces"),
  paginationOpts: paginationOptsValidator,
})
export const versionsResult = paginationResultValidator(
  v.object({
    ...recipeTables.recipeVersions.validator.fields,
    _id: v.id("recipeVersions"),
    _creationTime: v.number(),
  })
)
export async function versionsForPrincipal(
  ctx: QueryCtx,
  args: Infer<typeof versionsArgs>,
  agent?: AgentPrincipal
) {
  await recipeMember(ctx, args.workspaceId, "read", agent)
  return ctx.db
    .query("recipeVersions")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .paginate(args.paginationOpts)
}
export const versions = query({
  args: versionsArgs.fields,
  returns: versionsResult,
  handler: (ctx, args) => versionsForPrincipal(ctx, args),
})
/** Permissions use the verified caller, separate from recipe run grants. */
export const permissions = query({
  args: { versionId: v.id("recipeVersions") },
  returns: v.object({ canManage: v.boolean(), canRun: v.boolean() }),
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId)
    if (!version) throw new Error("Recipe not found")
    const member = await requireMembership(ctx, version.workspaceId, "read")
    // Running and managing need a role that can write.
    if (!roleAllows(member.role, "write"))
      return { canManage: false, canRun: false }
    const canManage = member.userId === version.createdBy
    const grant = canManage
      ? null
      : await ctx.db
          .query("recipeRunGrants")
          .withIndex("by_versionId_and_userId", (q) =>
            q.eq("versionId", versionId).eq("userId", member.userId)
          )
          .unique()
    return { canManage, canRun: canManage || grant !== null }
  },
})
export const runsArgs = v.object({
  workspaceId: v.id("workspaces"),
  paginationOpts: paginationOptsValidator,
})
export const runsResult = paginationResultValidator(
  v.object({
    ...recipeTables.recipeRuns.validator.fields,
    _id: v.id("recipeRuns"),
    _creationTime: v.number(),
  })
)
export async function runsForPrincipal(
  ctx: QueryCtx,
  args: Infer<typeof runsArgs>,
  agent?: AgentPrincipal
) {
  await recipeMember(ctx, args.workspaceId, "read", agent)
  return ctx.db
    .query("recipeRuns")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
    .order("desc")
    .paginate(args.paginationOpts)
}
export const runs = query({
  args: runsArgs.fields,
  returns: runsResult,
  handler: (ctx, args) => runsForPrincipal(ctx, args),
})
export const historyArgs = v.object({
  runId: v.id("recipeRuns"),
  paginationOpts: paginationOptsValidator,
})
export const historyResult = paginationResultValidator(
  v.object({
    ...recipeTables.recipeStepAttempts.validator.fields,
    _id: v.id("recipeStepAttempts"),
    _creationTime: v.number(),
  })
)
export async function historyForPrincipal(
  ctx: QueryCtx,
  args: Infer<typeof historyArgs>,
  agent?: AgentPrincipal
) {
  const run = await ctx.db.get(args.runId)
  if (!run) throw new Error("Run not found")
  await recipeMember(ctx, run.workspaceId, "read", agent)
  return ctx.db
    .query("recipeStepAttempts")
    .withIndex("by_runId_and_step", (q) => q.eq("runId", args.runId))
    .paginate(args.paginationOpts)
}
export const history = query({
  args: historyArgs.fields,
  returns: historyResult,
  handler: (ctx, args) => historyForPrincipal(ctx, args),
})

/** A run is started manually, by a schedule, or as a retry of a prior run. */
type RunOrigin =
  | { kind: "manual" }
  | { kind: "schedule"; scheduleId: Id<"recipeSchedules"> }
  | { kind: "retry"; retryOf: Id<"recipeRuns"> }

async function enqueue(
  ctx: MutationCtx,
  version: Doc<"recipeVersions">,
  key: string,
  origin: RunOrigin
) {
  const retryOf = origin.kind === "retry" ? origin.retryOf : undefined
  const existing = await ctx.db
    .query("recipeRuns")
    .withIndex("by_workspaceId_and_key", (q) =>
      q.eq("workspaceId", version.workspaceId).eq("key", key)
    )
    .unique()
  if (existing) {
    if (existing.versionId !== version._id)
      throw new Error("Idempotency key belongs to another recipe version")
    if (existing.retryOf !== retryOf)
      throw new Error("Idempotency key belongs to another retry")
    return { runId: existing._id, created: false }
  }
  const runId = await ctx.db.insert("recipeRuns", {
    workspaceId: version.workspaceId,
    versionId: version._id,
    scheduleId: origin.kind === "schedule" ? origin.scheduleId : undefined,
    retryOf,
    key,
    state: "pending",
    cancelRequested: false,
    leaseUntil: 0,
    epoch: 0,
    nextStep: 0,
  })
  return { runId, created: true }
}
function checkIdempotencyKey(key: string) {
  if (!key || key.length > 200)
    throw new Error("Idempotency key must be 1 to 200 characters")
}
export const triggerArgs = v.object({
  versionId: v.id("recipeVersions"),
  idempotencyKey: v.string(),
})
export const triggerResult = v.id("recipeRuns")
export async function triggerForPrincipal(
  ctx: MutationCtx,
  args: Infer<typeof triggerArgs>,
  agent?: AgentPrincipal
) {
  const version = await ctx.db.get(args.versionId)
  if (!version) throw new Error("Recipe not found")
  const actor = await requireRecipeAccess(ctx, version, "run", agent)
  checkIdempotencyKey(args.idempotencyKey)
  const run = await enqueue(ctx, version, `manual:${args.idempotencyKey}`, {
    kind: "manual",
  })
  if (run.created)
    await recordAuditEvent(ctx, version.workspaceId, actor, {
      operation: "run.trigger",
      runId: run.runId,
      versionId: version._id,
    })
  return run.runId
}
export const trigger = mutation({
  args: triggerArgs.fields,
  returns: triggerResult,
  handler: (ctx, args) => triggerForPrincipal(ctx, args),
})
export const retryArgs = v.object({
  runId: v.id("recipeRuns"),
  idempotencyKey: v.string(),
})
export const retryResult = v.id("recipeRuns")
/**
 * Starts a new run of a failed or cancelled run's pinned recipe version.
 * The new run links to the original through `retryOf`. Reuse
 * `idempotencyKey` to repeat the request without a second run.
 */
export async function retryForPrincipal(
  ctx: MutationCtx,
  args: Infer<typeof retryArgs>,
  agent?: AgentPrincipal
) {
  const run = await ctx.db.get(args.runId)
  if (!run) throw new Error("Run not found")
  const version = await ctx.db.get(run.versionId)
  if (!version) throw new Error("Recipe not found")
  const actor = await requireRecipeAccess(ctx, version, "run", agent)
  if (run.state !== "failed" && run.state !== "cancelled")
    throw new Error("Only a failed or cancelled run can be retried")
  checkIdempotencyKey(args.idempotencyKey)
  const retry = await enqueue(ctx, version, `retry:${args.idempotencyKey}`, {
    kind: "retry",
    retryOf: run._id,
  })
  if (retry.created)
    await recordAuditEvent(ctx, version.workspaceId, actor, {
      operation: "run.retry",
      runId: retry.runId,
      retryOf: run._id,
    })
  return retry.runId
}
export const retry = mutation({
  args: retryArgs.fields,
  returns: retryResult,
  handler: (ctx, args) => retryForPrincipal(ctx, args),
})
export const scheduleArgs = v.object({
  versionId: v.id("recipeVersions"),
  timing: recipeTimingValidator,
})
export const scheduleResult = v.id("recipeSchedules")
export async function scheduleForPrincipal(
  ctx: MutationCtx,
  args: Infer<typeof scheduleArgs>,
  agent?: AgentPrincipal
) {
  const version = await ctx.db.get(args.versionId)
  if (!version) throw new Error("Recipe not found")
  const actor = await requireRecipeAccess(ctx, version, "manage", agent)
  validateTiming(args.timing)
  const nextAt = nextOccurrence(args.timing, Date.now())
  if (nextAt === null) throw new Error("Schedule must be in the future")
  const scheduleId = await ctx.db.insert("recipeSchedules", {
    workspaceId: version.workspaceId,
    ...args,
    enabled: true,
    nextAt,
  })
  await recordAuditEvent(ctx, version.workspaceId, actor, {
    operation: "schedule.create",
    scheduleId,
    versionId: version._id,
  })
  return scheduleId
}
export const schedule = mutation({
  args: scheduleArgs.fields,
  returns: scheduleResult,
  handler: (ctx, args) => scheduleForPrincipal(ctx, args),
})
export const schedulesArgs = v.object({
  workspaceId: v.id("workspaces"),
  paginationOpts: paginationOptsValidator,
})
export const schedulesResult = paginationResultValidator(
  v.object({
    ...recipeTables.recipeSchedules.validator.fields,
    _id: v.id("recipeSchedules"),
    _creationTime: v.number(),
  })
)
export async function schedulesForPrincipal(
  ctx: QueryCtx,
  args: Infer<typeof schedulesArgs>,
  agent?: AgentPrincipal
) {
  await recipeMember(ctx, args.workspaceId, "read", agent)
  return ctx.db
    .query("recipeSchedules")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
    .paginate(args.paginationOpts)
}
export const schedules = query({
  args: schedulesArgs.fields,
  returns: schedulesResult,
  handler: (ctx, args) => schedulesForPrincipal(ctx, args),
})
export const setEnabledArgs = v.object({
  scheduleId: v.id("recipeSchedules"),
  enabled: v.boolean(),
})
export const setEnabledResult = v.null()
export async function setEnabledForPrincipal(
  ctx: MutationCtx,
  args: Infer<typeof setEnabledArgs>,
  agent?: AgentPrincipal
) {
  const item = await ctx.db.get(args.scheduleId)
  if (!item) throw new Error("Schedule not found")
  const version = await ctx.db.get(item.versionId)
  if (!version) throw new Error("Recipe not found")
  const actor = await requireRecipeAccess(ctx, version, "manage", agent)
  if (args.enabled === item.enabled) return null
  const nextAt = args.enabled
    ? nextOccurrence(item.timing, Date.now())
    : item.nextAt
  if (nextAt === null) throw new Error("One-off schedule has ended")
  await ctx.db.patch(item._id, {
    enabled: args.enabled,
    nextAt,
    revision: (item.revision ?? 0) + 1,
  })
  await recordAuditEvent(ctx, item.workspaceId, actor, {
    operation: "schedule.setEnabled",
    scheduleId: item._id,
    enabled: args.enabled,
  })
  return null
}
export const setEnabled = mutation({
  args: setEnabledArgs.fields,
  returns: setEnabledResult,
  handler: (ctx, args) => setEnabledForPrincipal(ctx, args),
})
export const updateScheduleArgs = v.object({
  scheduleId: v.id("recipeSchedules"),
  expectedRevision: v.number(),
  versionId: v.id("recipeVersions"),
  timing: recipeTimingValidator,
})
export const updateScheduleResult = v.object({ revision: v.number() })
/**
 * Changes the timing and the pinned version. The next run time starts again
 * from now, so a change never runs missed occurrences. A run that is active
 * stays active, and the overlap rule still skips while it runs.
 */
export async function updateScheduleForPrincipal(
  ctx: MutationCtx,
  args: Infer<typeof updateScheduleArgs>,
  agent?: AgentPrincipal
) {
  const item = await ctx.db.get(args.scheduleId)
  if (!item) throw new Error("Schedule not found")
  const current = await ctx.db.get(item.versionId)
  if (!current) throw new Error("Recipe not found")
  await requireRecipeAccess(ctx, current, "manage", agent)
  const revision = item.revision ?? 0
  if (args.expectedRevision !== revision)
    throw new Error(
      `Schedule revision conflict: current revision is ${revision}`
    )
  const version =
    args.versionId === current._id ? current : await ctx.db.get(args.versionId)
  if (!version || version.workspaceId !== item.workspaceId)
    throw new Error("Recipe not found")
  const actor = await requireRecipeAccess(ctx, version, "manage", agent)
  validateTiming(args.timing)
  const nextAt = nextOccurrence(args.timing, Date.now())
  if (nextAt === null) throw new Error("Schedule must be in the future")
  await ctx.db.patch(item._id, {
    versionId: version._id,
    timing: args.timing,
    nextAt,
    revision: revision + 1,
  })
  await recordAuditEvent(ctx, item.workspaceId, actor, {
    operation: "schedule.update",
    scheduleId: item._id,
    versionId: version._id,
    revision: revision + 1,
  })
  return { revision: revision + 1 }
}
export const updateSchedule = mutation({
  args: updateScheduleArgs.fields,
  returns: updateScheduleResult,
  handler: (ctx, args) => updateScheduleForPrincipal(ctx, args),
})
export const cancelArgs = v.object({ runId: v.id("recipeRuns") })
export const cancelResult = v.null()
export async function cancelForPrincipal(
  ctx: MutationCtx,
  args: Infer<typeof cancelArgs>,
  agent?: AgentPrincipal
) {
  const run = await ctx.db.get(args.runId)
  if (!run) throw new Error("Run not found")
  const version = await ctx.db.get(run.versionId)
  if (!version) throw new Error("Recipe not found")
  const actor = await requireRecipeAccess(ctx, version, "run", agent)
  if (terminal(run) || run.cancelRequested) return null
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
  await recordAuditEvent(ctx, run.workspaceId, actor, {
    operation: "run.cancel",
    runId: run._id,
  })
  return null
}
export const cancel = mutation({
  args: cancelArgs.fields,
  returns: cancelResult,
  handler: (ctx, args) => cancelForPrincipal(ctx, args),
})

/** Called by the one Cloudflare dispatcher. No Convex cron runs it. */
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
      const { runId, created } = await enqueue(
        ctx,
        version,
        occurrenceId(item._id, at),
        {
          kind: "schedule",
          scheduleId: item._id,
        }
      )
      if (created)
        await recordAuditEvent(
          ctx,
          version.workspaceId,
          { kind: "scheduler", scheduleId: item._id },
          { operation: "run.trigger", runId, versionId: version._id }
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
    // The budget may be lower than when the version was published.
    if (
      recipeBudgetProblem(
        version.recipe,
        await workspaceBudgets(ctx, run.workspaceId)
      )
    ) {
      await ctx.db.patch(runId, { state: "failed", finishedAt: now })
      return null
    }
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
      await recordSyncOutcome(ctx, run, version.recipe, "failure", now)
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
      await recordSyncOutcome(ctx, run, version.recipe, "failure", now)
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
