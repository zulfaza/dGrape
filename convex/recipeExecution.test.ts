/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it } from "vitest"
import { v } from "convex/values"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import { internalAction } from "./_generated/server"
import type { Recipe } from "./lib/recipeDomain"
import { recordValuesValidator } from "./lib/collectionDomain"

async function setup(kind: "upsert" | "snapshot" = "upsert", maxPages = 3) {
  const fetchPage = internalAction({
    args: {
      workspaceId: v.id("workspaces"),
      connectionId: v.string(),
      principalUserId: v.string(),
      route: v.string(),
      method: v.literal("GET"),
      query: v.record(v.string(), v.string()),
      cursor: v.union(v.string(), v.null()),
      limits: v.object({ maxRows: v.number(), maxBytes: v.number() }),
    },
    returns: v.object({
      rows: v.array(recordValuesValidator),
      nextCursor: v.union(v.string(), v.null()),
      bytesRead: v.number(),
    }),
    handler: async (_ctx, args) => ({
      rows: [{ id: args.cursor ? "b" : "a", total: args.cursor ? 20 : 10 }],
      nextCursor: args.cursor ? null : "page2",
      bytesRead: 30,
    }),
  })
  const modules = {
    ...import.meta.glob("./**/*.ts"),
    "./connectors.ts": async () => ({ fetchPage }),
  }
  const t = convexTest(schema, modules)
  const { workspaceId, collectionId } = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Proof" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: "proof|owner",
      role: "owner",
    })
    const collectionId = await ctx.db.insert("collections", {
      workspaceId,
      name: "Data",
      definition: {
        version: 1,
        fields: [
          { id: "id", label: "ID", type: "text", indexed: true },
          { id: "total", label: "Total", type: "number" },
        ],
      },
    })
    return { workspaceId, collectionId }
  })
  const owner = t.withIdentity({ tokenIdentifier: "proof|owner" })
  const recipe: Recipe = {
    steps: [
      { kind: "fetch", connectionId: "test", route: "/data", maxPages },
      kind === "upsert"
        ? { kind: "upsert", collectionId, source: "api", identityField: "id" }
        : { kind: "snapshot", collectionId },
    ],
    limits: { rows: 100, bytes: 10000, durationMs: 60000, attempts: 3 },
  }
  const versionId = await owner.mutation(api.recipes.publish, {
    workspaceId,
    name: "Data",
    recipe,
  })
  const runId = await owner.mutation(api.recipes.trigger, {
    versionId,
    idempotencyKey: "one",
  })
  const [claim] = await t.mutation(internal.recipes.dispatch, {})
  const args = { runId, epoch: claim.epoch }
  await t.mutation(internal.recipes.begin, args)
  return { t, owner, args, collectionId }
}
describe("durable recipe checkpoints", () => {
  it("fetches multiple pages and atomically saves rows, cursor and completion on duplicate delivery", async () => {
    const { t, args, collectionId } = await setup()
    await t.action(internal.recipeRunner.execute, { ...args, step: 0 })
    const before = await t.run((ctx) =>
      ctx.db
        .query("collectionRecords")
        .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
        .take(10)
    )
    expect(before).toEqual([])
    await t.action(internal.recipeRunner.execute, { ...args, step: 1 })
    await t.action(internal.recipeRunner.execute, { ...args, step: 1 })
    const result = await t.run(async (ctx) => ({
      records: await ctx.db
        .query("collectionRecords")
        .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
        .take(10),
      run: await ctx.db.get(args.runId),
      cursor: await ctx.db
        .query("sourceCursors")
        .withIndex("by_collectionId_and_source", (q) =>
          q.eq("collectionId", collectionId).eq("source", "api")
        )
        .unique(),
    }))
    expect(result.records.map((row) => row.values.total)).toEqual([10, 20])
    expect(result.records.map((row) => row.revision)).toEqual([1, 1])
    expect(result.run?.state).toBe("succeeded")
    expect(result.cursor?.cursor).toBe("")
  })
  it("records source freshness: never synced, synced, then stale after a failed run", async () => {
    const { t, owner, args, collectionId } = await setup()
    const workspaceId = await t.run(async (ctx) => {
      const collection = await ctx.db.get(collectionId)
      if (!collection) throw new Error("Collection missing")
      return collection.workspaceId
    })
    expect(await owner.query(api.sourceSyncs.list, { workspaceId })).toEqual([
      { collectionId, name: "Data", freshness: { kind: "never_synced" } },
    ])
    const versionId = await t.run(async (ctx) => {
      const run = await ctx.db.get(args.runId)
      if (!run) throw new Error("Run missing")
      return run.versionId
    })
    // As if an hourly schedule started this run.
    const scheduleId = await owner.mutation(api.recipes.schedule, {
      versionId,
      timing: { kind: "cron", expression: "0 * * * *" },
    })
    await t.run((ctx) => ctx.db.patch(args.runId, { scheduleId }))
    await t.action(internal.recipeRunner.execute, { ...args, step: 0 })
    await t.action(internal.recipeRunner.execute, { ...args, step: 1 })
    const [synced] = await owner.query(api.sourceSyncs.list, { workspaceId })
    expect(synced).toMatchObject({
      collectionId,
      name: "Data",
      freshness: { kind: "synced", runId: args.runId },
    })
    // Stale after the second hour mark: one whole interval was missed.
    const syncedAt =
      synced?.freshness.kind === "synced"
        ? synced.freshness.lastSuccessfulSyncAt
        : -1
    const hour = 3_600_000
    expect(synced?.freshness).toMatchObject({
      staleAfter: (Math.floor(syncedAt / hour) + 2) * hour,
    })
    await owner.mutation(api.recipes.setEnabled, { scheduleId, enabled: false })
    const [unscheduled] = await owner.query(api.sourceSyncs.list, {
      workspaceId,
    })
    expect(unscheduled?.freshness).toMatchObject({ staleAfter: null })
    const failedRunId = await owner.mutation(api.recipes.trigger, {
      versionId,
      idempotencyKey: "two",
    })
    const [claim] = await t.mutation(internal.recipes.dispatch, {})
    await t.mutation(internal.recipeExecution.finishFailed, {
      runId: failedRunId,
      epoch: claim.epoch,
    })
    const [stale] = await owner.query(api.sourceSyncs.list, { workspaceId })
    expect(stale?.freshness).toMatchObject({
      kind: "stale",
      lastSuccessfulSyncAt:
        synced?.freshness.kind === "synced"
          ? synced.freshness.lastSuccessfulSyncAt
          : -1,
      failedRunId,
    })
    const saved = await owner.mutation(api.savedQueries.save, {
      collectionId,
      name: "Totals",
      query: { fieldId: "id", order: "asc" },
    })
    const page = await owner.query(api.savedQueries.run, {
      queryId: saved.queryId,
      expectedRevision: saved.revision,
      paginationOpts: {
        numItems: 10,
        cursor: null,
        maximumRowsRead: 100,
        maximumBytesRead: 1_000_000,
      },
    })
    expect(page.source.freshness.kind).toBe("stale")
    expect(page.dataAsOf).toBe(
      stale?.freshness.kind === "stale"
        ? stale.freshness.lastSuccessfulSyncAt
        : -1
    )
    expect(page.evaluatedAt).toBeGreaterThanOrEqual(page.dataAsOf ?? 0)
  })
  it("rejects an output from another workspace before reading its cursor", async () => {
    const { t, args, collectionId } = await setup()
    await t.run(async (ctx) => {
      const workspaceId = await ctx.db.insert("workspaces", { name: "Other" })
      await ctx.db.patch(collectionId, { workspaceId })
    })
    await expect(
      t.query(internal.recipeExecution.inspect, args)
    ).rejects.toThrow("Output collection access denied")
  })
  it("rejects output changed after the fetch started", async () => {
    for (const kind of ["upsert", "snapshot"] satisfies (
      | "upsert"
      | "snapshot"
    )[]) {
      const { t, args, collectionId } = await setup(kind)
      await t.action(internal.recipeRunner.execute, { ...args, step: 0 })
      await t.run((ctx) =>
        ctx.db.insert("collectionRecords", {
          collectionId,
          schemaVersion: 1,
          revision: 1,
          values: { id: "newer", total: 99 },
        })
      )
      await expect(
        t.action(internal.recipeRunner.execute, { ...args, step: 1 })
      ).rejects.toThrow("Step failed")
      expect((await t.run((ctx) => ctx.db.get(args.runId)))?.nextStep).toBe(1)
    }
  })
  it("keeps run grants separate from recipe management", async () => {
    const { t, owner, args } = await setup()
    const versionId = await t.run(async (ctx) => {
      const run = await ctx.db.get(args.runId)
      if (!run) throw new Error("Run missing")
      await ctx.db.insert("workspaceMembers", {
        workspaceId: run.workspaceId,
        userId: "proof|runner",
        role: "owner",
      })
      return run.versionId
    })
    const runner = t.withIdentity({ tokenIdentifier: "proof|runner" })
    await expect(
      runner.mutation(api.recipes.trigger, {
        versionId,
        idempotencyKey: "denied",
      })
    ).rejects.toThrow("Recipe permission denied")
    await owner.mutation(api.recipes.setRunAccess, {
      versionId,
      userId: "proof|runner",
      allowed: true,
    })
    await runner.mutation(api.recipes.trigger, {
      versionId,
      idempotencyKey: "allowed",
    })
    await expect(
      runner.mutation(api.recipes.schedule, {
        versionId,
        timing: { kind: "once", at: Date.now() + 60000 },
      })
    ).rejects.toThrow("Recipe permission denied")
    await owner.mutation(api.recipes.setRunAccess, {
      versionId,
      userId: "proof|runner",
      allowed: false,
    })
    await expect(
      runner.mutation(api.recipes.trigger, {
        versionId,
        idempotencyKey: "revoked",
      })
    ).rejects.toThrow("Recipe permission denied")
  })
  it("does not commit incomplete pagination", async () => {
    const { t, args } = await setup("upsert", 1)
    await expect(
      t.action(internal.recipeRunner.execute, { ...args, step: 0 })
    ).rejects.toThrow("Step failed")
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("recipeCheckpoints")
          .withIndex("by_runId_and_step", (q) => q.eq("runId", args.runId))
          .take(10)
      )
    ).toEqual([])
    expect(await t.run((ctx) => ctx.db.query("sourceCursors").take(1))).toEqual(
      []
    )
  })
  it("rolls output back when the source cursor changes before save", async () => {
    const { t, args, collectionId } = await setup()
    await t.action(internal.recipeRunner.execute, { ...args, step: 0 })
    await t.run((ctx) =>
      ctx.db.insert("sourceCursors", {
        collectionId,
        source: "api",
        cursor: "conflict",
      })
    )
    await expect(
      t.action(internal.recipeRunner.execute, { ...args, step: 1 })
    ).rejects.toThrow("Step failed")
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("collectionRecords")
          .withIndex("by_collection", (q) => q.eq("collectionId", collectionId))
          .take(10)
      )
    ).toEqual([])
    expect((await t.run((ctx) => ctx.db.get(args.runId)))?.nextStep).toBe(1)
  })
  it("publishes a complete snapshot and cancellation prevents output publication", async () => {
    const { t, owner, args, collectionId } = await setup("snapshot")
    await t.action(internal.recipeRunner.execute, { ...args, step: 0 })
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("snapshotPublications")
          .withIndex("by_collectionId", (q) =>
            q.eq("collectionId", collectionId)
          )
          .unique()
      )
    ).toBeNull()
    await owner.mutation(api.recipes.cancel, { runId: args.runId })
    await t.action(internal.recipeRunner.execute, { ...args, step: 1 })
    expect(
      await t.run((ctx) =>
        ctx.db
          .query("snapshotPublications")
          .withIndex("by_collectionId", (q) =>
            q.eq("collectionId", collectionId)
          )
          .unique()
      )
    ).toBeNull()
    const second = await setup("snapshot")
    await second.t.action(internal.recipeRunner.execute, {
      ...second.args,
      step: 0,
    })
    await second.t.action(internal.recipeRunner.execute, {
      ...second.args,
      step: 1,
    })
    expect(
      await second.t.run((ctx) =>
        ctx.db
          .query("snapshotPublications")
          .withIndex("by_collectionId", (q) =>
            q.eq("collectionId", second.collectionId)
          )
          .unique()
      )
    ).toMatchObject({ rowCount: 2 })
  })
})
