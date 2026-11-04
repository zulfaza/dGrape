/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { Schema } from "effect"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import * as Queries from "./lib/agentQueryTransport"
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
  expect(first.source.freshness).toEqual({ kind: "never_synced" })
  expect(first.dataAsOf).toBeNull()
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

test("agent credentials save, list, and run queries in their own workspace", async () => {
  const t = convexTest(schema, modules)
  const { digestToken } = await import("./agentAccess")
  const writer = "a".repeat(64)
  const reader = "b".repeat(64)
  const { collectionId, foreignCollectionId } = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Mine" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: "owner",
      role: "owner",
    })
    for (const [token, scope] of [
      [writer, "readwrite"],
      [reader, "readonly"],
    ] as const)
      await ctx.db.insert("agentGrants", {
        workspaceId,
        owner: "owner",
        digest: await digestToken(token),
        scope,
        state: "active",
        expiresAt: Date.now() + 60000,
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
    const other = await ctx.db.insert("workspaces", { name: "Other" })
    const foreignCollectionId = await ctx.db.insert("collections", {
      workspaceId: other,
      name: "Theirs",
      definition: { version: 1, fields: [] },
    })
    return { collectionId: id, foreignCollectionId }
  })
  type Body =
    | typeof Queries.SaveInput.Type
    | typeof Queries.ListInput.Type
    | typeof Queries.RunInput.Type
  const call = async (operation: string, body: Body, token = writer) => {
    const response = await t.fetch(`/agent/queries/${operation}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }
  const query = { fieldId: "name", where: { lower: { value: "b" } } }

  expect(
    await call("save", { collectionId, name: "From b", query }, reader)
  ).toMatchObject({ status: 403 })
  expect(
    await call("save", {
      collectionId: foreignCollectionId,
      name: "Theirs",
      query,
    })
  ).toMatchObject({ status: 403 })
  expect(
    await call("save", {
      collectionId,
      name: "Bad",
      query: { fieldId: "missing" },
    })
  ).toEqual({ status: 400, body: { error: 'Unknown field "missing"' } })

  const saved = await call("save", { collectionId, name: "From b", query })
  expect(saved).toMatchObject({ status: 200, body: { revision: 1 } })
  const { queryId } = saved.body
  expect(
    await call("save", {
      collectionId,
      name: "Again",
      query,
      queryId,
      expectedRevision: 2,
    })
  ).toMatchObject({ status: 409 })

  expect(await call("list", {}, reader)).toMatchObject({
    status: 200,
    body: {
      isDone: true,
      page: [{ queryId, name: "From b", revision: 1, status: "current" }],
    },
  })
  const run = await call("run", { queryId, revision: 1, limit: 1 }, reader)
  expect(run).toMatchObject({
    status: 200,
    body: { queryId, revision: 1, completeness: "partial", isDone: false },
  })
  expect(run.body.page.map((row: { values: unknown }) => row.values)).toEqual([
    { name: "b" },
  ])
  expect(run.body.page[0]).not.toHaveProperty("collectionId")
  expect(Schema.decodeUnknownSync(Queries.RunPage)(run.body)).toMatchObject({
    dataAsOf: null,
    source: { collectionId, freshness: { kind: "never_synced" } },
  })
  expect(
    await call("run", { queryId, revision: 1, cursor: run.body.continueCursor })
  ).toMatchObject({ status: 200, body: { completeness: "complete" } })
  await t.run(async (ctx) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Missing fixture")
    await ctx.db.patch(collection.workspaceId, {
      budgets: { queryBytesRead: 10 },
    })
  })
  expect(await call("run", { queryId, revision: 1 }, reader)).toMatchObject({
    status: 400,
    body: {
      error: "Query result byte budget exceeded (limit 10)",
      code: "QueryTooExpensive",
      hint: expect.stringContaining("summary collection"),
    },
  })
  expect(await call("run", { queryId, revision: 9 })).toEqual({
    status: 400,
    body: { error: "Query revision mismatch" },
  })
  expect(await call("run", { queryId: "nope", revision: 1 })).toMatchObject({
    status: 403,
  })
}, 30_000)

test("workspace roles limit viewers to reads and editors to data changes", async () => {
  const t = convexTest(schema, modules)
  const { workspaceId, collectionId } = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Roles" })
    for (const role of ["owner", "editor", "viewer"] as const)
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: role,
        role,
      })
    const collectionId = await ctx.db.insert("collections", {
      workspaceId,
      name: "Rows",
      definition: {
        version: 1,
        fields: [{ id: "name", label: "Name", type: "text", indexed: true }],
      },
    })
    return { workspaceId, collectionId }
  })
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const editor = t.withIdentity({ tokenIdentifier: "editor" })
  const viewer = t.withIdentity({ tokenIdentifier: "viewer" })
  const denied = "Workspace permission denied for your role"
  const page = { numItems: 10, cursor: null }

  // Writes: owners and editors only.
  await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { name: "a" },
  })
  await editor.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { name: "b" },
  })
  await expect(
    viewer.mutation(api.workspaces.createRecord, {
      collectionId,
      values: { name: "c" },
    })
  ).rejects.toThrow(denied)
  await expect(
    viewer.mutation(api.savedQueries.save, {
      collectionId,
      name: "Names",
      query: { fieldId: "name", order: "asc" },
    })
  ).rejects.toThrow(denied)

  // Reads: every role.
  const rows = await viewer.query(api.workspaces.listRecords, {
    collectionId,
    paginationOpts: page,
  })
  expect(rows.page.map((row) => row.values.name)).toEqual(["a", "b"])

  // Members, credentials, agent grants and budgets: owners only.
  for (const member of [editor, viewer]) {
    await expect(
      member.mutation(api.secrets.prepare, {
        workspaceId,
        label: "Key",
        private: true,
      })
    ).rejects.toThrow(denied)
    await expect(
      member.query(api.agentGrants.list, { workspaceId, paginationOpts: page })
    ).rejects.toThrow(denied)
    await expect(
      member.mutation(api.workspaceBudgets.set, { workspaceId, overrides: {} })
    ).rejects.toThrow(denied)
  }
  await owner.mutation(api.workspaceBudgets.set, { workspaceId, overrides: {} })

  // An agent credential works only while its owner keeps the owner role.
  const now = Date.now()
  await t.run(async (ctx) => {
    for (const userId of ["owner", "editor"])
      await ctx.db.insert("agentGrants", {
        workspaceId,
        owner: userId,
        digest: `${userId}-digest`,
        expiresAt: now + 60_000,
        state: "active",
        scope: "readwrite",
      })
  })
  const describe = (digest: string) =>
    t.query(internal.agentGrants.describe, { digest, now })
  expect(await describe("owner-digest")).not.toBe("denied")
  expect(await describe("editor-digest")).toBe("denied")
})
