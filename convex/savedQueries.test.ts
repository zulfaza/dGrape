/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { api } from "./_generated/api"
import { insertRecord } from "./lib/records"
const modules = import.meta.glob("./**/*.ts")

test("saved queries enforce membership, immutable revisions, source schema, and page budgets", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const other = t.withIdentity({ tokenIdentifier: "other" })
  const collectionId = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Mine" })
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
    for (const name of ["a", "b", "c"])
      await insertRecord(ctx, collection, { name })
    return id
  })
  const saved = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Names",
    query: { fieldId: "name", order: "asc" },
  })
  const paginationOpts = {
    numItems: 2,
    cursor: null,
    maximumRowsRead: 100,
    maximumBytesRead: 1_000_000,
  }
  await expect(
    other.query(api.savedQueries.run, {
      queryId: saved.queryId,
      expectedRevision: 1,
      paginationOpts,
    })
  ).rejects.toThrow("Workspace access denied")
  const first = await owner.query(api.savedQueries.run, {
    queryId: saved.queryId,
    expectedRevision: 1,
    paginationOpts,
  })
  expect(first.page.map((row) => row.values.name)).toEqual(["a", "b"])
  expect(first.completeness).toBe("partial")
  const split = await owner.query(api.savedQueries.run, {
    queryId: saved.queryId,
    expectedRevision: 1,
    paginationOpts: {
      ...paginationOpts,
      maximumRowsRead: 1,
      endCursor: first.continueCursor,
    },
  })
  expect(split.pageStatus).toBe("SplitRequired")
  expect(split).toHaveProperty("splitCursor")
  expect(split.completeness).toBe("partial")
  const last = await owner.query(api.savedQueries.run, {
    queryId: saved.queryId,
    expectedRevision: 1,
    paginationOpts: { ...paginationOpts, cursor: first.continueCursor },
  })
  expect(last.page.map((row) => row.values.name)).toEqual(["c"])
  expect(last.completeness).toBe("complete")
  await expect(
    owner.query(api.savedQueries.run, {
      queryId: saved.queryId,
      expectedRevision: 1,
      paginationOpts: { numItems: 50, cursor: null },
    })
  ).rejects.toThrow("budget required")
  await owner.mutation(api.savedQueries.save, {
    queryId: saved.queryId,
    expectedRevision: 1,
    collectionId,
    name: "Reverse",
    query: { fieldId: "name", order: "desc" },
  })
  expect(
    (
      await owner.query(api.savedQueries.run, {
        queryId: saved.queryId,
        expectedRevision: 1,
        paginationOpts,
      })
    ).page[0]?.values.name
  ).toBe("a")
  expect(
    (
      await owner.query(api.savedQueries.run, {
        queryId: saved.queryId,
        expectedRevision: 2,
        paginationOpts,
      })
    ).page[0]?.values.name
  ).toBe("c")
  await expect(
    owner.mutation(api.savedQueries.save, {
      queryId: saved.queryId,
      expectedRevision: 1,
      collectionId,
      name: "Stale",
      query: { fieldId: "name", order: "asc" },
    })
  ).rejects.toThrow("revision conflict")
  await expect(
    owner.query(api.savedQueries.run, {
      queryId: saved.queryId,
      expectedRevision: 99,
      paginationOpts,
    })
  ).rejects.toThrow("revision mismatch")
  await t.run(async (ctx) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Missing fixture")
    await ctx.db.patch(collectionId, {
      definition: { ...collection.definition, version: 2 },
    })
  })
  await expect(
    owner.query(api.savedQueries.run, {
      queryId: saved.queryId,
      expectedRevision: 2,
      paginationOpts,
    })
  ).rejects.toThrow("schema mismatch")
})
