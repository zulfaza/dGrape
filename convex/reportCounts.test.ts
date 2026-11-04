/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import { ConvexError } from "convex/values"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import { asQueryTooExpensive } from "./lib/queryErrors"
import { insertRecord, replaceRecordValues, deleteRecord } from "./lib/records"
const modules = import.meta.glob("./**/*.ts")

test("counts rebuild after corrections and deletes and enforce owner access", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const other = t.withIdentity({ tokenIdentifier: "other" })
  const collectionId = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Reports" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: "owner",
      role: "owner",
    })
    return ctx.db.insert("collections", {
      workspaceId,
      name: "Rows",
      definition: {
        version: 1,
        fields: [{ id: "name", label: "Name", type: "text", indexed: true }],
      },
    })
  })
  const saved = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Count",
    query: { fieldId: "name", order: "asc" },
  })
  const args = { queryId: saved.queryId, expectedRevision: 1 }
  expect(await owner.query(api.reportCounts.read, args)).toEqual({
    state: "pending",
  })
  await expect(other.mutation(api.reportCounts.rebuild, args)).rejects.toThrow(
    "Workspace access denied"
  )
  await expect(other.query(api.reportCounts.read, args)).rejects.toThrow(
    "Workspace access denied"
  )
  await owner.mutation(api.reportCounts.rebuild, args)
  expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
    state: "complete",
    count: 0,
  })
  const recordId = await t.run(async (ctx) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Missing collection")
    return insertRecord(ctx, collection, { name: "a" })
  })
  expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
    state: "stale",
  })
  await owner.mutation(api.reportCounts.rebuild, args)
  expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
    state: "complete",
    count: 1,
  })
  await t.run(async (ctx) => {
    const collection = await ctx.db.get(collectionId)
    const record = await ctx.db.get(recordId)
    if (!collection || !record) throw new Error("Missing record")
    await replaceRecordValues(ctx, collection, record, { name: "b" })
  })
  expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
    state: "stale",
  })
  await owner.mutation(api.reportCounts.rebuild, args)
  await t.run((ctx) => deleteRecord(ctx, recordId))
  expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
    state: "stale",
  })
  await owner.mutation(api.reportCounts.rebuild, args)
  expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
    state: "complete",
    count: 0,
  })
  await t.run(async (ctx) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Missing collection")
    for (let i = 0; i < 51; i++)
      await insertRecord(ctx, collection, { name: String(i) })
  })
  await owner.mutation(api.reportCounts.rebuild, args)
  expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
    state: "failed",
  })
})

test("byte budget failures are stored", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const collectionId = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Wide" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: "owner",
      role: "owner",
    })
    const id = await ctx.db.insert("collections", {
      workspaceId,
      name: "Wide",
      definition: {
        version: 1,
        fields: [{ id: "name", label: "Name", type: "text", indexed: true }],
      },
    })
    const collection = await ctx.db.get(id)
    if (!collection) throw new Error("Missing collection")
    for (let i = 0; i < 40; i++)
      await insertRecord(ctx, collection, {
        name: String(i),
        a: "a".repeat(10000),
        b: "b".repeat(10000),
        c: "c".repeat(10000),
      })
    return id
  })
  const saved = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Wide",
    query: { fieldId: "name", order: "asc" },
  })
  const args = { queryId: saved.queryId, expectedRevision: 1 }
  const failure = await owner
    .query(api.savedQueries.run, {
      ...args,
      paginationOpts: {
        numItems: 50,
        cursor: null,
        maximumRowsRead: 100,
        maximumBytesRead: 1_000_000,
      },
    })
    .then(
      () => null,
      (error: Error) => error
    )
  if (!(failure instanceof ConvexError)) throw new Error("Expected ConvexError")
  expect(asQueryTooExpensive(failure)).toMatchObject({
    budget: "resultBytes",
    limit: 1_000_000,
  })
  await owner.mutation(api.reportCounts.rebuild, args)
  expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
    state: "failed",
    message: "Report exceeds the result byte budget",
  })
})

test("background rebuilds are bounded, retry safe, and stop on source changes or revoked access", async () => {
  vi.useFakeTimers()
  try {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ tokenIdentifier: "owner" })
    const collectionId = await t.run(async (ctx) => {
      const workspaceId = await ctx.db.insert("workspaces", {
        name: "Background",
      })
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: "owner",
        role: "owner",
      })
      const id = await ctx.db.insert("collections", {
        workspaceId,
        name: "Rows",
        definition: {
          version: 1,
          fields: [{ id: "name", label: "Name", type: "text", indexed: true }],
        },
      })
      const collection = await ctx.db.get(id)
      if (!collection) throw new Error("Missing fixture")
      for (let i = 0; i < 125; i++)
        await insertRecord(ctx, collection, { name: String(i) })
      return id
    })
    const saved = await owner.mutation(api.savedQueries.save, {
      collectionId,
      name: "Count",
      query: { fieldId: "name", order: "asc" },
    })
    const args = { queryId: saved.queryId, expectedRevision: 1 }
    const report = async () => {
      const row = await t.run((ctx) =>
        ctx.db
          .query("reportCounts")
          .withIndex("by_queryId_and_revision", (q) =>
            q.eq("queryId", saved.queryId).eq("revision", 1)
          )
          .unique()
      )
      if (!row) throw new Error("Missing report")
      return row
    }
    const step = async () => {
      const row = await report()
      if (row.result.kind !== "building") throw new Error("Not building")
      const stepArgs = {
        reportId: row._id,
        generation: row.builtAt,
        page: row.result.pages,
      }
      await t.mutation(internal.reportCounts.step, stepArgs)
      return stepArgs
    }
    await owner.mutation(api.reportCounts.start, args)
    await expect(
      t
        .withIdentity({ tokenIdentifier: "other" })
        .mutation(api.reportCounts.start, args)
    ).rejects.toThrow("Workspace access denied")
    const first = await step()
    expect(await owner.query(api.reportCounts.read, args)).toEqual({
      state: "building",
      processed: 50,
    })
    await owner.mutation(api.reportCounts.start, args)
    await t.mutation(internal.reportCounts.step, first)
    expect(await owner.query(api.reportCounts.read, args)).toEqual({
      state: "building",
      processed: 50,
    })
    await step()
    await step()
    expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
      state: "complete",
      count: 125,
    })
    await owner.mutation(api.reportCounts.start, args)
    await step()
    await t.run(async (ctx) => {
      const collection = await ctx.db.get(collectionId)
      if (!collection) throw new Error("Missing fixture")
      await insertRecord(ctx, collection, { name: "new" })
    })
    await step()
    expect((await report()).result).toMatchObject({
      kind: "failed",
      message: "Source changed; restart rebuild",
    })
    expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
      state: "stale",
    })
    await owner.mutation(api.reportCounts.start, args)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await owner.query(api.reportCounts.read, args)).toMatchObject({
      state: "complete",
      count: 126,
    })
    await owner.mutation(api.reportCounts.start, args)
    await t.run(async (ctx) => {
      const collection = await ctx.db.get(collectionId)
      if (!collection) throw new Error("Missing fixture")
      const member = await ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace_user", (q) =>
          q.eq("workspaceId", collection.workspaceId).eq("userId", "owner")
        )
        .unique()
      if (!member) throw new Error("Missing member")
      await ctx.db.delete(member._id)
    })
    await step()
    expect((await report()).result).toMatchObject({
      kind: "failed",
      message: "Workspace access revoked",
    })
  } finally {
    vi.clearAllTimers()
    vi.useRealTimers()
  }
})
