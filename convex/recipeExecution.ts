import { Result, Schema } from "effect"
import { v, type Infer } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { recordValuesValidator } from "./lib/collectionDomain"
import { recipeValidator, checkBudget } from "./lib/recipeDomain"
import { runningRun, recipeOutputToken } from "./recipes"
import {
  readSourceCursor,
  commitSourceCursor,
  upsertSourceRecord,
  stageSnapshotChunk,
  publishSnapshot,
} from "./lib/recordPublication"

const SourceIdentity = Schema.Union([Schema.String, Schema.Number])

export const executionArgs = {
  runId: v.id("recipeRuns"),
  epoch: v.number(),
  step: v.number(),
}
export const checkpoint = internalQuery({
  args: executionArgs,
  returns: v.object({
    rows: v.array(recordValuesValidator),
    sourceCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.epoch !== args.epoch) throw new Error("Run lease is stale")
    const previous = await ctx.db
      .query("recipeCheckpoints")
      .withIndex("by_runId_and_step", (q) =>
        q.eq("runId", run._id).eq("step", args.step - 1)
      )
      .unique()
    return {
      rows: previous?.rows ?? [],
      sourceCursor: previous?.sourceCursor ?? null,
    }
  },
})
/** Saving output and advancing the step is one transaction, even on redelivery. */
export const commit = internalMutation({
  args: {
    ...executionArgs,
    attempt: v.number(),
    rows: v.array(recordValuesValidator),
    sourceCursor: v.optional(v.union(v.string(), v.null())),
    artifactKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stored = await ctx.db.get(args.runId)
    if (stored && stored.epoch === args.epoch && stored.nextStep > args.step)
      return null
    const run = await runningRun(ctx, args.runId, args.epoch)
    const now = Date.now()
    const version = await ctx.db.get(run.versionId)
    if (!version || args.step !== run.nextStep)
      throw new Error("Steps must run in order")
    if (run.cancelRequested) {
      await ctx.db.patch(run._id, { state: "cancelled", finishedAt: now })
      return null
    }
    if (
      run.startedAt === undefined ||
      now - run.startedAt > version.recipe.limits.durationMs
    )
      throw new Error("Recipe duration limit exceeded")
    checkBudget(args.rows, version.recipe.limits)
    const attempts = await ctx.db
      .query("recipeStepAttempts")
      .withIndex("by_runId_and_step", (q) =>
        q.eq("runId", run._id).eq("step", args.step)
      )
      .take(6)
    const attempt = attempts.find((item) => item.attempt === args.attempt)
    if (
      attempt?.state !== "started" ||
      attempts.some((item) => item.attempt > args.attempt)
    )
      throw new Error("Step attempt is stale")
    const step = version.recipe.steps[args.step]
    if (!step) throw new Error("Invalid recipe step")
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", run.workspaceId).eq("userId", version.createdBy)
      )
      .unique()
    if (!member) throw new Error("Recipe owner no longer has access")
    if (step.kind === "upsert" || step.kind === "snapshot") {
      const id = ctx.db.normalizeId("collections", step.collectionId)
      const collection = id ? await ctx.db.get(id) : null
      if (!collection || collection.workspaceId !== run.workspaceId)
        throw new Error("Output collection access denied")
      if (
        run.outputToken === undefined ||
        run.outputToken !==
          (await recipeOutputToken(ctx, run.workspaceId, step.collectionId))
      )
        throw new Error("Recipe output changed during execution")
      if (step.kind === "upsert") {
        if (args.rows.length > 100)
          throw new Error("Upsert output permits at most 100 rows")
        for (const row of args.rows) {
          const identityKey = Schema.decodeUnknownResult(SourceIdentity)(
            Object.hasOwn(row, step.identityField)
              ? row[step.identityField]
              : undefined
          )
          if (Result.isFailure(identityKey))
            throw new Error("Source identity must be a string or number")
          const key = String(identityKey.success)
          const identity = await ctx.db
            .query("recordIdentities")
            .withIndex("by_collectionId_and_source_and_key", (q) =>
              q
                .eq("collectionId", collection._id)
                .eq("source", step.source)
                .eq("key", key)
            )
            .unique()
          const record = identity ? await ctx.db.get(identity.recordId) : null
          await upsertSourceRecord(ctx, {
            collection,
            source: step.source,
            key,
            expectedRevision: record?.revision ?? null,
            values: row,
          })
        }
        // A complete bounded scan clears the pagination cursor. Nothing advances on a failed save.
        if (args.sourceCursor !== undefined)
          await commitSourceCursor(ctx, {
            collectionId: collection._id,
            source: step.source,
            expectedCursor: args.sourceCursor,
            cursor: "",
          })
      } else {
        if (args.rows.length > 100)
          throw new Error("Snapshot output permits at most 100 rows")
        const generation = String(run._id)
        const chunks: string[] = []
        for (let i = 0; i < Math.max(args.rows.length, 1); i += 10) {
          const chunkId = String(i / 10)
          chunks.push(chunkId)
          await stageSnapshotChunk(ctx, {
            collection,
            generation,
            chunkId,
            values: args.rows.slice(i, i + 10),
          })
        }
        const current = await ctx.db
          .query("snapshotPublications")
          .withIndex("by_collectionId", (q) =>
            q.eq("collectionId", collection._id)
          )
          .unique()
        await publishSnapshot(ctx, {
          collection,
          generation,
          expectedGeneration: current?.generation ?? null,
          expectedChunks: chunks,
        })
      }
    }
    if (step.kind === "artifact") {
      const expected = `workspaces/${run.workspaceId}/recipes/${run._id}/${args.epoch}/${args.step}/${args.attempt}`
      if (args.artifactKey !== expected)
        throw new Error("Artifact upload is missing")
      await ctx.db.insert("artifacts", {
        workspaceId: run.workspaceId,
        key: expected,
        name: step.name,
        contentType: "application/json",
        size: new TextEncoder().encode(JSON.stringify(args.rows)).byteLength,
        createdBy: { kind: "user", userId: version.createdBy },
      })
    }
    await ctx.db.insert("recipeCheckpoints", {
      runId: run._id,
      step: args.step,
      rows: args.rows,
      sourceCursor: args.sourceCursor,
    })
    await ctx.db.patch(attempt._id, { state: "succeeded", finishedAt: now })
    const finished = args.step === version.recipe.steps.length - 1
    const progress = {
      nextStep: args.step + 1,
      leaseUntil: now + 120000,
    }
    await ctx.db.patch(
      run._id,
      finished ? { ...progress, state: "succeeded", finishedAt: now } : progress
    )
    return null
  },
})

export const contextResult = v.object({
  recipe: v.union(
    v.null(),
    v.object({ steps: v.number(), attempts: v.number() })
  ),
  state: v.union(v.literal("running"), v.literal("terminal")),
})
export type ContextResult = Infer<typeof contextResult>
export const finishFailed = internalMutation({
  args: { runId: v.id("recipeRuns"), epoch: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (
      run &&
      run.epoch === args.epoch &&
      (run.state === "pending" || run.state === "running")
    )
      await ctx.db.patch(run._id, {
        state: run.cancelRequested ? "cancelled" : "failed",
        finishedAt: Date.now(),
      })
    return null
  },
})

export const inspect = internalQuery({
  args: { runId: v.id("recipeRuns"), epoch: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      recipe: recipeValidator,
      workspaceId: v.id("workspaces"),
      createdBy: v.string(),
      nextStep: v.number(),
      sourceCursor: v.union(v.string(), v.null()),
    })
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId)
    if (!run || run.epoch !== args.epoch || run.state !== "running") return null
    const version = await ctx.db.get(run.versionId)
    if (!version) throw new Error("Recipe missing")
    const output = version.recipe.steps.at(-1)
    let sourceCursor: string | null = null
    if (output?.kind === "upsert") {
      const collectionId = ctx.db.normalizeId(
        "collections",
        output.collectionId
      )
      if (!collectionId) throw new Error("Output collection missing")
      const collection = await ctx.db.get(collectionId)
      if (!collection || collection.workspaceId !== run.workspaceId)
        throw new Error("Output collection access denied")
      sourceCursor = await readSourceCursor(ctx, {
        collectionId,
        source: output.source,
      })
    }
    return {
      recipe: version.recipe,
      workspaceId: run.workspaceId,
      createdBy: version.createdBy,
      nextStep: run.nextStep,
      sourceCursor,
    }
  },
})
export const reconcile = internalMutation({
  args: {},
  returns: v.array(
    v.object({
      runId: v.id("recipeRuns"),
      epoch: v.number(),
      timedOut: v.boolean(),
    })
  ),
  handler: async (ctx) => {
    const now = Date.now()
    const expired = await ctx.db
      .query("recipeRuns")
      .withIndex("by_state_and_leaseUntil", (q) =>
        q.eq("state", "running").lte("leaseUntil", now)
      )
      .take(16)
    const result = []
    for (const run of expired) {
      const version = await ctx.db.get(run.versionId)
      result.push({
        runId: run._id,
        epoch: run.epoch,
        timedOut:
          !version ||
          run.startedAt === undefined ||
          now - run.startedAt >= version.recipe.limits.durationMs,
      })
      await ctx.db.patch(run._id, { leaseUntil: now + 120000 })
    }
    return result
  },
})
export const resolveRun = internalQuery({
  args: { id: v.string() },
  returns: v.union(v.null(), v.id("recipeRuns")),
  handler: async (ctx, { id }) => {
    const runId = ctx.db.normalizeId("recipeRuns", id)
    return runId && (await ctx.db.get(runId)) ? runId : null
  },
})
