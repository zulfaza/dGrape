/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { Schema } from "effect"
import { ConvexError } from "convex/values"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import * as Queries from "./lib/agentQueryTransport"
import type { SavedQuery } from "./lib/queryAggregate"
import { asQueryTooExpensive } from "./lib/queryErrors"
import type { RecordQuery } from "./lib/recordQuery"
import type { RecordValues } from "./lib/collectionDomain"
import { insertRecord } from "./lib/records"
import { sha256 } from "./lib/agentAuthCrypto"
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

  // Reads: every role. Each caller sees their own role.
  for (const [member, role] of [
    [owner, "owner"],
    [editor, "editor"],
    [viewer, "viewer"],
  ] as const)
    expect((await member.query(api.workspaces.get, { workspaceId })).role).toBe(
      role
    )
  const rows = await viewer.query(api.workspaces.listRecords, {
    collectionId,
    paginationOpts: page,
  })
  expect(rows.page.map((row) => row.values.name)).toEqual(["a", "b"])

  // Writers pick workspace secrets for records; they see no private ones.
  await t.run(async (ctx) => {
    for (const owner of [
      { kind: "workspace" as const },
      { kind: "user" as const, userId: "owner" },
    ])
      await ctx.db.insert("secretRefs", {
        workspaceId,
        label: owner.kind,
        createdBy: "owner",
        owner,
        revision: 1,
        state: {
          kind: "pending",
          writeUntil: 0,
          name: "n",
          previousName: null,
        },
      })
  })
  const options = await editor.query(api.secrets.referenceOptions, {
    workspaceId,
    paginationOpts: page,
  })
  expect(options.page.map((option) => option.label)).toEqual(["workspace"])
  await expect(
    viewer.query(api.secrets.referenceOptions, {
      workspaceId,
      paginationOpts: page,
    })
  ).rejects.toThrow(denied)

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

test("owners invite members, change roles and always keep one owner", async () => {
  const t = convexTest(schema, modules)
  const workspaceId = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Team" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: "owner",
      role: "owner",
    })
    return workspaceId
  })
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const guest = t.withIdentity({ tokenIdentifier: "guest" })
  const page = { numItems: 10, cursor: null }

  // Only the invited, verified email can redeem the link, once.
  const token = await owner.action(api.invites.create, {
    workspaceId,
    email: " Guest@Example.com ",
    role: "viewer",
  })
  const tokenDigest = await sha256(token)
  const redeem = (email: string) =>
    t.mutation(internal.invites.redeem, { tokenDigest, userId: "guest", email })
  expect(await redeem("other@example.com")).toEqual({ status: "wrong_account" })
  expect(await redeem("guest@example.com")).toEqual({
    status: "joined",
    workspaceId,
  })
  expect(await redeem("guest@example.com")).toEqual({ status: "invalid" })

  // Expired invites do not block new ones.
  await t.run(async (ctx) => {
    for (let i = 0; i < 50; i++)
      await ctx.db.insert("workspaceInvites", {
        workspaceId,
        email: `old${i}@example.com`,
        role: "viewer",
        tokenDigest: `old${i}`,
        invitedBy: "owner",
        expiresAt: 0,
      })
  })
  await owner.action(api.invites.create, {
    workspaceId,
    email: "new@example.com",
    role: "editor",
  })

  // A viewer cannot manage members or invite.
  await expect(
    guest.query(api.members.list, { workspaceId, paginationOpts: page })
  ).rejects.toThrow("Workspace permission denied for your role")
  await expect(
    guest.action(api.invites.create, {
      workspaceId,
      email: "x@example.com",
      role: "editor",
    })
  ).rejects.toThrow("Workspace permission denied for your role")
  const members = await owner.query(api.members.list, {
    workspaceId,
    paginationOpts: page,
  })
  expect(members.page.map((m) => [m.userId, m.role, m.email])).toEqual([
    ["guest", "viewer", "guest@example.com"],
    ["owner", "owner", null],
  ])

  // The last owner cannot leave the owner role.
  await expect(
    owner.mutation(api.members.setRole, {
      workspaceId,
      userId: "owner",
      role: "editor",
    })
  ).rejects.toThrow("at least one owner")
  await expect(
    owner.mutation(api.members.remove, { workspaceId, userId: "owner" })
  ).rejects.toThrow("at least one owner")

  // A demoted and promoted owner does not get old agent tokens back.
  await owner.mutation(api.members.setRole, {
    workspaceId,
    userId: "guest",
    role: "owner",
  })
  const now = Date.now()
  await t.run((ctx) =>
    ctx.db.insert("agentGrants", {
      workspaceId,
      owner: "guest",
      digest: "guest-digest",
      expiresAt: now + 60_000,
      state: "active",
      scope: "readwrite",
    })
  )
  const describe = () =>
    t.query(internal.agentGrants.describe, { digest: "guest-digest", now })
  expect(await describe()).not.toBe("denied")
  for (const role of ["editor", "owner"] as const)
    await owner.mutation(api.members.setRole, {
      workspaceId,
      userId: "guest",
      role,
    })
  expect(await describe()).toBe("denied")

  // Removed members lose access.
  await owner.mutation(api.members.remove, { workspaceId, userId: "guest" })
  await expect(
    guest.query(api.workspaces.get, { workspaceId })
  ).rejects.toThrow("Workspace access denied")
})

test("saved queries filter by an in list and by residual filters, and select fields", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const collectionId = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Mine" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: "owner",
      role: "owner",
    })
    const id = await ctx.db.insert("collections", {
      workspaceId,
      name: "Jobs",
      definition: {
        version: 1,
        fields: [
          { id: "name", label: "Name", type: "text", indexed: true },
          { id: "salary", label: "Salary", type: "integer", optional: true },
          {
            id: "tags",
            label: "Tags",
            type: "multiSelect",
            options: ["remote", "senior"],
          },
          { id: "active", label: "Active", type: "boolean" },
        ],
      },
    })
    const collection = await ctx.db.get(id)
    if (!collection) throw new Error("Missing fixture")
    const rows: RecordValues[] = [
      { name: "a", salary: 10, tags: ["remote"], active: true },
      { name: "b", salary: 20, tags: [], active: false },
      { name: "c", tags: ["senior"], active: true },
      { name: "d", salary: 40, tags: ["remote", "senior"], active: true },
    ]
    for (const values of rows) await insertRecord(ctx, collection, values)
    return id
  })
  const paginationOpts = {
    numItems: 50,
    cursor: null,
    maximumRowsRead: 100,
    maximumBytesRead: 1_000_000,
  }
  const names = async (query: RecordQuery) => {
    const saved = await owner.mutation(api.savedQueries.save, {
      collectionId,
      name: "Filtered",
      query,
    })
    const result = await owner.query(api.savedQueries.run, {
      queryId: saved.queryId,
      expectedRevision: 1,
      paginationOpts,
    })
    expect(result.completeness).toBe("complete")
    return result.page.map((row) => row.values.name)
  }
  expect(
    await names({ fieldId: "name", order: "desc", where: { in: ["d", "a"] } })
  ).toEqual(["d", "a"])
  expect(
    await names({
      fieldId: "name",
      order: "asc",
      filters: [{ fieldId: "salary", op: "gte", value: 20 }],
    })
  ).toEqual(["b", "d"])
  expect(
    await names({
      fieldId: "name",
      order: "asc",
      filters: [
        { fieldId: "tags", op: "in", values: ["senior"] },
        { fieldId: "active", op: "eq", value: true },
      ],
    })
  ).toEqual(["c", "d"])
  expect(
    await names({
      fieldId: "name",
      order: "asc",
      filters: [{ fieldId: "tags", op: "neq", value: "remote" }],
    })
  ).toEqual(["b", "c"])
  const selected = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Salaries",
    query: {
      fieldId: "name",
      order: "asc",
      filters: [{ fieldId: "active", op: "eq", value: true }],
      select: ["salary", "name"],
    },
  })
  const salaries = await owner.query(api.savedQueries.run, {
    queryId: selected.queryId,
    expectedRevision: 1,
    paginationOpts,
  })
  expect(salaries.resultSchema.fields.map((field) => field.id)).toEqual([
    "salary",
    "name",
  ])
  expect(salaries.page.map((row) => row.values)).toEqual([
    { salary: 10, name: "a" },
    { name: "c" },
    { salary: 40, name: "d" },
  ])
  const invalidQueries: Array<[RecordQuery, string]> = [
    [{ fieldId: "name", order: "asc", where: { in: [] } }, "1 to 20 values"],
    [
      {
        fieldId: "name",
        order: "asc",
        filters: [{ fieldId: "active", op: "lt", value: true }],
      },
      "only eq, neq and in",
    ],
    [
      {
        fieldId: "name",
        order: "asc",
        filters: [{ fieldId: "salary", op: "eq", value: "high" }],
      },
      "safe integer",
    ],
    [
      {
        fieldId: "name",
        order: "asc",
        filters: [{ fieldId: "missing", op: "eq", value: 1 }],
      },
      'Unknown filter field "missing"',
    ],
    [
      { fieldId: "name", order: "asc", select: ["name", "name"] },
      "each field once",
    ],
    [
      { fieldId: "name", order: "asc", select: ["missing"] },
      'Unknown selected field "missing"',
    ],
  ]
  for (const [query, message] of invalidQueries)
    await expect(
      owner.mutation(api.savedQueries.save, {
        collectionId,
        name: "Bad",
        query,
      })
    ).rejects.toThrow(message)
})

test("saved aggregates group by date buckets within one bounded read", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const { workspaceId, collectionId } = await t.run(async (ctx) => {
    const workspaceId = await ctx.db.insert("workspaces", { name: "Mine" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: "owner",
      role: "owner",
    })
    const id = await ctx.db.insert("collections", {
      workspaceId,
      name: "Payments",
      definition: {
        version: 1,
        fields: [
          { id: "day", label: "Day", type: "date", indexed: true },
          { id: "at", label: "At", type: "timestamp" },
          { id: "amount", label: "Amount", type: "integer", optional: true },
          { id: "stage", label: "Stage", type: "select", options: ["a", "b"] },
        ],
      },
    })
    const collection = await ctx.db.get(id)
    if (!collection) throw new Error("Missing fixture")
    const rows: RecordValues[] = [
      // 2026-11-02 is a Monday.
      {
        day: "2026-11-02",
        at: Date.UTC(2026, 10, 2, 9),
        amount: 10,
        stage: "a",
      },
      {
        day: "2026-11-08",
        at: Date.UTC(2026, 10, 8, 23),
        amount: 30,
        stage: "b",
      },
      { day: "2026-11-09", at: Date.UTC(2026, 10, 9), stage: "a" },
      { day: "2026-12-01", at: Date.UTC(2026, 11, 1), amount: 5, stage: "a" },
    ]
    for (const values of rows) await insertRecord(ctx, collection, values)
    return { workspaceId, collectionId: id }
  })
  const aggregate = async (query: SavedQuery) => {
    const saved = await owner.mutation(api.savedQueries.save, {
      collectionId,
      name: "Totals",
      query,
    })
    return owner.query(api.savedQueries.aggregate, {
      queryId: saved.queryId,
      expectedRevision: 1,
    })
  }
  const weekly = await aggregate({
    fieldId: "day",
    order: "asc",
    aggregate: {
      groupBy: { fieldId: "day", bucket: "week" },
      measures: [
        { op: "count" },
        { op: "sum", fieldId: "amount" },
        { op: "average", fieldId: "amount" },
        { op: "max", fieldId: "at" },
      ],
    },
  })
  expect(
    weekly.resultSchema.fields.map((field) => [field.id, field.type])
  ).toEqual([
    ["day", "date"],
    ["count", "integer"],
    ["sum_amount", "number"],
    ["average_amount", "number"],
    ["max_at", "timestamp"],
  ])
  expect(weekly.rows.map((row) => row.values)).toEqual([
    {
      day: "2026-11-02",
      count: 2,
      sum_amount: 40,
      average_amount: 20,
      max_at: Date.UTC(2026, 10, 8, 23),
    },
    {
      day: "2026-11-09",
      count: 1,
      sum_amount: 0,
      max_at: Date.UTC(2026, 10, 9),
    },
    {
      day: "2026-11-30",
      count: 1,
      sum_amount: 5,
      average_amount: 5,
      max_at: Date.UTC(2026, 11, 1),
    },
  ])
  expect(weekly).toMatchObject({ completeness: "complete", matched: 4 })
  const monthly = await aggregate({
    fieldId: "day",
    order: "desc",
    where: { lower: { value: "2026-11-08", inclusive: true } },
    filters: [{ fieldId: "stage", op: "eq", value: "a" }],
    aggregate: {
      groupBy: { fieldId: "at", bucket: "month" },
      measures: [{ op: "count" }, { op: "min", fieldId: "amount" }],
    },
  })
  expect(monthly.rows.map((row) => row.values)).toEqual([
    { at: Date.UTC(2026, 11, 1), count: 1, min_amount: 5 },
    { at: Date.UTC(2026, 10, 1), count: 1 },
  ])
  const invalidAggregates: Array<[SavedQuery, string]> = [
    [
      {
        fieldId: "day",
        order: "asc",
        aggregate: {
          groupBy: { fieldId: "stage", bucket: "day" },
          measures: [{ op: "count" }],
        },
      },
      "has no date buckets",
    ],
    [
      {
        fieldId: "day",
        order: "asc",
        aggregate: { measures: [{ op: "sum", fieldId: "stage" }] },
      },
      "needs a number or integer field",
    ],
    [
      { fieldId: "day", order: "asc", aggregate: { measures: [] } },
      "1 to 5 measures",
    ],
    [
      {
        fieldId: "day",
        order: "asc",
        select: ["day"],
        aggregate: { measures: [{ op: "count" }] },
      },
      "has no select",
    ],
  ]
  for (const [query, message] of invalidAggregates)
    await expect(
      owner.mutation(api.savedQueries.save, {
        collectionId,
        name: "Bad",
        query,
      })
    ).rejects.toThrow(message)
  const records = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Rows",
    query: { fieldId: "day", order: "asc" },
  })
  await expect(
    owner.query(api.savedQueries.aggregate, {
      queryId: records.queryId,
      expectedRevision: 1,
    })
  ).rejects.toThrow("has no aggregate")
  const counted = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Count",
    query: {
      fieldId: "day",
      order: "asc",
      aggregate: { measures: [{ op: "count" }] },
    },
  })
  await expect(
    owner.query(api.savedQueries.run, {
      queryId: counted.queryId,
      expectedRevision: 1,
      paginationOpts: {
        numItems: 50,
        cursor: null,
        maximumRowsRead: 100,
        maximumBytesRead: 1_000_000,
      },
    })
  ).rejects.toThrow("read it with the aggregate operation")
  await t.run((ctx) =>
    ctx.db.patch(workspaceId, { budgets: { queryRowsRead: 3 } })
  )
  const failure = await owner
    .query(api.savedQueries.aggregate, {
      queryId: counted.queryId,
      expectedRevision: 1,
    })
    .then(
      () => null,
      (error: Error) => error
    )
  if (!(failure instanceof ConvexError)) throw new Error("Expected ConvexError")
  expect(asQueryTooExpensive(failure)).toMatchObject({
    budget: "rowsRead",
    limit: 3,
    hint: expect.stringContaining("summary collection"),
  })
})
