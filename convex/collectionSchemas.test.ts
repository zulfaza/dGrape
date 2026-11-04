/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import { publishCompatibleSchema } from "./lib/collectionSchemas"
import type { CollectionField } from "./lib/collectionDomain"
import { v, type Value } from "convex/values"
import { runOnce } from "./lib/operations"
const modules = import.meta.glob("./**/*.ts")

async function fixture() {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Mine",
  })
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Rows",
    fields: [{ id: "name", label: "Name", type: "text", indexed: true }],
  })
  return { t, owner, collectionId, workspaceId }
}

test("rename preserves immutable history, IDs, records and indexes; stale revisions and invalid edits roll back", async () => {
  const { t, owner, collectionId } = await fixture()
  const recordId = await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { name: "A" },
  })
  await owner.mutation(api.collectionSchemas.renameField, {
    collectionId,
    expectedVersion: 1,
    fieldId: "name",
    label: " Company ",
  })
  expect(
    (await owner.query(api.workspaces.getCollection, { collectionId }))
      .definition.fields[0]?.label
  ).toBe("Company")
  expect(
    (await owner.query(api.collectionSchemas.get, { collectionId, version: 1 }))
      ?.fields[0]?.label
  ).toBe("Name")
  expect(
    (await owner.query(api.workspaces.getRecord, { collectionId, recordId }))
      .values
  ).toEqual({ name: "A" })
  expect(
    (
      await owner.query(api.workspaces.queryRecords, {
        collectionId,
        query: { fieldId: "name", order: "asc" },
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page.map((row) => row._id)
  ).toEqual([recordId])
  await expect(
    owner.mutation(api.collectionSchemas.renameField, {
      collectionId,
      expectedVersion: 1,
      fieldId: "name",
      label: "Stale",
    })
  ).rejects.toThrow("revision conflict")
  await expect(
    owner.mutation(api.collectionSchemas.renameField, {
      collectionId,
      expectedVersion: 2,
      fieldId: "name",
      label: " ",
    })
  ).rejects.toThrow("Field label")
  await expect(
    owner.mutation(api.collectionSchemas.renameField, {
      collectionId,
      expectedVersion: 2,
      fieldId: "missing",
      label: "Absent",
    })
  ).rejects.toThrow("Unknown field")
  await owner.mutation(api.workspaces.addField, {
    collectionId,
    field: { id: "source", label: "Source", type: "text" },
  })
  const history = await owner.query(api.collectionSchemas.history, {
    collectionId,
    paginationOpts: { numItems: 2, cursor: null },
  })
  expect(history.page.map((row) => row.definition.version)).toEqual([3, 2])
  expect(history.isDone).toBe(false)
  expect(
    (
      await owner.query(api.collectionSchemas.history, {
        collectionId,
        paginationOpts: { numItems: 2, cursor: history.continueCursor },
      })
    ).page.map((row) => row.definition.version)
  ).toEqual([1])
  const other = t.withIdentity({ tokenIdentifier: "other" })
  await expect(
    other.query(api.collectionSchemas.history, {
      collectionId,
      paginationOpts: { numItems: 10, cursor: null },
    })
  ).rejects.toThrow("access denied")
  await expect(
    other.query(api.collectionSchemas.get, { collectionId, version: 1 })
  ).rejects.toThrow("access denied")
  await expect(
    other.mutation(api.collectionSchemas.renameField, {
      collectionId,
      expectedVersion: 3,
      fieldId: "name",
      label: "No",
    })
  ).rejects.toThrow("access denied")
})

test("legacy collections preserve the available baseline without inventing earlier history", async () => {
  const { t, owner, workspaceId } = await fixture()
  const collectionId = await t.run((ctx) =>
    ctx.db.insert("collections", {
      workspaceId,
      name: "Legacy",
      definition: {
        version: 4,
        fields: [{ id: "name", label: "Name", type: "text" }],
      },
    })
  )
  expect(
    await owner.query(api.collectionSchemas.get, { collectionId, version: 1 })
  ).toBeNull()
  expect(
    (await owner.query(api.collectionSchemas.get, { collectionId, version: 4 }))
      ?.version
  ).toBe(4)
  await owner.mutation(api.collectionSchemas.renameField, {
    collectionId,
    expectedVersion: 4,
    fieldId: "name",
    label: "Company",
  })
  expect(
    (
      await owner.query(api.collectionSchemas.history, {
        collectionId,
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page.map((row) => row.definition.version)
  ).toEqual([5, 4])
})

test("compatible helper refuses incompatible changes and stale transaction-local definitions", async () => {
  const { t, owner, collectionId } = await fixture()
  const candidates: CollectionField[][] = [
    [{ id: "name", label: "Name", type: "number", indexed: true }],
    [{ id: "name", label: "Name", type: "text" }],
    [{ id: "renamed_id", label: "Name", type: "text", indexed: true }],
    [
      {
        id: "name",
        label: "Name",
        type: "text",
        indexed: true,
        optional: true,
      },
    ],
    [
      { id: "name", label: "Name", type: "text", indexed: true },
      { id: "required", label: "Required", type: "text" },
    ],
  ]
  for (const fields of candidates) {
    await expect(
      t.run(async (ctx) => {
        const collection = await ctx.db.get(collectionId)
        if (!collection) throw new Error("Missing collection")
        await publishCompatibleSchema(ctx, collection, { version: 2, fields })
      })
    ).rejects.toThrow(/requires migration|must be optional/)
  }
  await expect(
    t.run(async (ctx) => {
      const collection = await ctx.db.get(collectionId)
      if (!collection) throw new Error("Missing collection")
      await publishCompatibleSchema(ctx, collection, {
        version: 2,
        fields: [
          { id: "name", label: "Amount", type: "number", indexed: true },
        ],
      })
    })
  ).rejects.toThrow("requires migration")
  await expect(
    t.run(async (ctx) => {
      const collection = await ctx.db.get(collectionId)
      if (!collection) throw new Error("Missing collection")
      const next = { ...collection.definition, version: 2 }
      await publishCompatibleSchema(ctx, collection, next)
      await publishCompatibleSchema(ctx, collection, next)
    })
  ).rejects.toThrow("revision conflict")
  expect(
    await owner.query(api.collectionSchemas.get, { collectionId, version: 2 })
  ).toBeNull()
})

test("compatible helper keeps select options and accepts new ones", async () => {
  const { t, owner, workspaceId } = await fixture()
  const select = (options: string[]): CollectionField[] => [
    { id: "stage", label: "Stage", type: "select", options },
  ]
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Stages",
    fields: select(["applied", "offer"]),
  })
  const publish = (version: number, fields: CollectionField[]) =>
    t.run(async (ctx) => {
      const collection = await ctx.db.get(collectionId)
      if (!collection) throw new Error("Missing collection")
      await publishCompatibleSchema(ctx, collection, { version, fields })
    })
  await expect(publish(2, select(["applied"]))).rejects.toThrow(
    "requires migration"
  )
  await publish(2, select(["applied", "offer", "rejected"]))
  expect(
    (await owner.query(api.workspaces.getCollection, { collectionId }))
      .definition.fields
  ).toEqual(select(["applied", "offer", "rejected"]))
})

test("agent collection creation and optional additions also preserve versions", async () => {
  const { t, owner, workspaceId } = await fixture()
  await t.run((ctx) =>
    ctx.db.insert("agentGrants", {
      workspaceId,
      owner: "owner",
      digest: "test",
      scope: "readwrite",
      state: "active",
      expiresAt: Date.now() + 60_000,
    })
  )
  const result = await t.mutation(internal.agentWrites.createCollection, {
    digest: "test",
    name: "Agent rows",
    fields: [{ id: "name", label: "Name", type: "text" }],
  })
  if (result.status !== "created") throw new Error("Create failed")
  expect(
    await t.mutation(internal.agentWrites.addField, {
      digest: "test",
      collectionId: result.id,
      field: { id: "source", label: "Source", type: "text" },
    })
  ).toMatchObject({ status: "added", version: 2 })
  expect(
    (
      await owner.query(api.collectionSchemas.get, {
        collectionId: result.id,
        version: 1,
      })
    )?.fields
  ).toHaveLength(1)
  expect(
    (
      await owner.query(api.collectionSchemas.get, {
        collectionId: result.id,
        version: 2,
      })
    )?.fields
  ).toHaveLength(2)
  const rename = {
    digest: "test",
    collectionId: result.id,
    fieldId: "source",
    label: " Origin ",
    expectedVersion: 2,
  }
  expect(
    await t.mutation(internal.collectionSchemas.renameFieldForAgent, rename)
  ).toEqual({ version: 3 })
  expect(
    (
      await owner.query(api.workspaces.getCollection, {
        collectionId: result.id,
      })
    ).definition.fields.map((field) => [field.id, field.label])
  ).toEqual([
    ["name", "Name"],
    ["source", "Origin"],
  ])
  await expect(
    t.mutation(internal.collectionSchemas.renameFieldForAgent, rename)
  ).rejects.toThrow("Schema revision conflict")
  await t.run(async (ctx) => {
    await ctx.db.insert("agentGrants", {
      workspaceId,
      owner: "owner",
      digest: "reader",
      scope: "readonly",
      state: "active",
      expiresAt: Date.now() + 60_000,
    })
  })
  await expect(
    t.mutation(internal.collectionSchemas.renameFieldForAgent, {
      ...rename,
      digest: "reader",
      expectedVersion: 3,
    })
  ).rejects.toThrow("does not have the scope data.write")
})

test("migration plans report changes, and dry runs report the records that do not fit", async () => {
  vi.useFakeTimers()
  const { t, owner, workspaceId } = await fixture()
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Deals",
    fields: [
      { id: "name", label: "Name", type: "text" },
      { id: "amount", label: "Amount", type: "text", optional: true },
      { id: "note", label: "Note", type: "text", optional: true },
    ],
  })
  const create = (values: Record<string, string>) =>
    owner.mutation(api.workspaces.createRecord, { collectionId, values })
  await create({ name: "A", amount: " 12 ", note: "keep?" })
  const wrong = await create({ name: "B", amount: "twelve" })
  const missing = await create({ name: "C" })
  const target: CollectionField[] = [
    { id: "name", label: "Name", type: "text" },
    { id: "amount", label: "Amount", type: "number" },
    { id: "stage", label: "Stage", type: "select", options: ["new", "won"] },
  ]
  const plan = (expectedVersion: number, fields = target, defaults = {}) =>
    owner.mutation(api.schemaMigrations.plan, {
      collectionId,
      expectedVersion,
      fields,
      defaults,
    })
  await expect(plan(2)).rejects.toThrow("revision conflict")
  await expect(
    plan(1, [
      { id: "name", label: "Name", type: "text" },
      { id: "amount", label: "Amount", type: "text", optional: true },
      { id: "note", label: "Note", type: "text", optional: true },
    ])
  ).rejects.toThrow("changes no field")
  await expect(plan(1, target, { stage: "lost" })).rejects.toThrow(
    "must be one of"
  )
  await expect(plan(1, target, { other: "x" })).rejects.toThrow("unknown field")
  const migrationId = await plan(1, target, { stage: "new" })
  const other = t.withIdentity({ tokenIdentifier: "other" })
  await expect(
    other.query(api.schemaMigrations.get, { migrationId })
  ).rejects.toThrow("access denied")
  await expect(
    other.mutation(api.schemaMigrations.dryRun, { migrationId })
  ).rejects.toThrow("access denied")

  const planned = await owner.query(api.schemaMigrations.get, { migrationId })
  expect(planned.target.version).toBe(2)
  expect(planned.state).toEqual({ kind: "planned" })
  expect(planned.changes.map((change) => change.kind).sort()).toEqual([
    "added",
    "changed",
    "removed",
  ])
  expect(planned.rollbackLimitations).toEqual([
    'Field "amount" changes from text to number. A change back may not restore the original values.',
    'Field "note" is removed. Its values are deleted from records and a later schema change cannot restore them.',
  ])

  await owner.mutation(api.schemaMigrations.dryRun, { migrationId })
  await t.finishAllScheduledFunctions(() => vi.runAllTimers())
  expect(
    (await owner.query(api.schemaMigrations.get, { migrationId })).state
  ).toEqual({
    kind: "checked",
    checked: 3,
    misfitCount: 2,
    misfits: [
      {
        recordId: wrong,
        message:
          'Field "amount" has a text value that does not convert to number',
      },
      { recordId: missing, message: 'Missing value for field "amount"' },
    ],
  })
  // The dry run changes no record and no schema.
  expect(
    (await owner.query(api.workspaces.getCollection, { collectionId }))
      .definition.version
  ).toBe(1)
  expect(
    (
      await owner.query(api.workspaces.getRecord, {
        collectionId,
        recordId: wrong,
      })
    ).values
  ).toEqual({ name: "B", amount: "twelve" })

  // A schema change after the plan makes it outdated.
  await owner.mutation(api.workspaces.addField, {
    collectionId,
    field: { id: "source", label: "Source", type: "text" },
  })
  expect(
    (await owner.query(api.schemaMigrations.get, { migrationId })).outdated
  ).toBe(true)
  await expect(
    owner.mutation(api.schemaMigrations.dryRun, { migrationId })
  ).rejects.toThrow("plan the migration again")
  await owner.mutation(api.schemaMigrations.cancel, { migrationId })
  const listed = await owner.query(api.schemaMigrations.list, {
    collectionId,
    paginationOpts: { numItems: 5, cursor: null },
  })
  expect(listed.page.map((row) => row.state.kind)).toEqual(["cancelled"])
  vi.useRealTimers()
})

// The first HTTP call loads the router, which can be slow on a busy runner.
test("agent discovery reports capabilities by scope and describes one collection", async () => {
  const { t, collectionId, workspaceId } = await fixture()
  const { digestToken } = await import("./agentAccess")
  const bearer = "d".repeat(64)
  await t.run(async (ctx) => {
    await ctx.db.insert("agentGrants", {
      workspaceId,
      owner: "owner",
      digest: await digestToken(bearer),
      scope: "readonly",
      state: "active",
      expiresAt: Date.now() + 60000,
    })
  })
  const get = (path: string) =>
    t.fetch(path, { headers: { Authorization: `Bearer ${bearer}` } })
  const capabilities = await (await get("/agent/capabilities")).json()
  expect(capabilities.scopes).toEqual([
    "data.read",
    "artifacts.read",
    "pages.read",
    "jobs.read",
  ])
  // A legacy read-only credential keeps exactly its read capabilities.
  for (const capability of capabilities.capabilities)
    expect(capability.allowed).toBe(capability.id.endsWith(".read"))
  expect(
    await (
      await get(`/agent/collections/describe?collectionId=${collectionId}`)
    ).json()
  ).toEqual({
    id: collectionId,
    name: "Rows",
    version: 1,
    fields: [{ id: "name", label: "Name", type: "text", indexed: true }],
  })
  expect(
    (await get("/agent/collections/describe?collectionId=missing")).status
  ).toBe(403)
  expect((await get("/agent/collections/describe")).status).toBe(400)
}, 20_000)

test("agent activity shows only events whose read scope the credential has", async () => {
  const { t, owner, collectionId, workspaceId } = await fixture()
  const { digestToken } = await import("./agentAccess")
  const reader = "a".repeat(64)
  const runner = "b".repeat(64)
  await t.run(async (ctx) => {
    for (const [bearer, scope] of [
      [reader, ["data.read"]],
      [runner, ["jobs.read"]],
    ] as const)
      await ctx.db.insert("agentGrants", {
        workspaceId,
        owner: "owner",
        digest: await digestToken(bearer),
        scope: [...scope],
        state: "active",
        expiresAt: Date.now() + 60000,
      })
  })
  await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { name: "A" },
  })
  const list = (bearer: string, body: { limit?: number; cursor?: string }) =>
    t.fetch("/agent/activity/list", {
      method: "POST",
      headers: { Authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
    })
  const first = await (await list(reader, { limit: 1 })).json()
  expect(first.page.map((row: { event: unknown }) => row.event)).toEqual([
    {
      operation: "record.create",
      collectionId,
      recordId: expect.any(String),
    },
  ])
  expect(first.page[0].actor).toEqual({ kind: "user", userId: "owner" })
  expect(first.isDone).toBe(false)
  const rest = await (
    await list(reader, { cursor: first.continueCursor })
  ).json()
  expect(
    rest.page.map(
      (row: { event: { operation: string } }) => row.event.operation
    )
  ).toEqual(["collection.create", "workspace.create"])
  // Data events need data.read; a jobs.read credential sees none of them.
  expect((await (await list(runner, {})).json()).page).toEqual([])
  expect((await list(reader, { limit: 51 })).status).toBe(400)
  expect((await list("c".repeat(64), {})).status).toBe(403)
}, 20_000)

test("an idempotency key returns the first result, refuses other input, and expires", async () => {
  const { t, workspaceId } = await fixture()
  let runs = 0
  const once = (caller: string, input: Value) =>
    t.run((ctx) =>
      runOnce(
        ctx,
        { workspaceId, caller, operation: "test.write", key: "k1", input },
        v.object({ run: v.number() }),
        async () => ({ run: ++runs })
      )
    )
  expect(await once("grant:a", { a: 1, b: [1, 2] })).toEqual({ run: 1 })
  // The same input with its keys in another order is the same request.
  expect(await once("grant:a", { b: [1, 2], a: 1 })).toEqual({ run: 1 })
  await expect(once("grant:a", { a: 2, b: [1, 2] })).rejects.toThrow(
    "different request"
  )
  // A key belongs to one caller.
  expect(await once("grant:b", { a: 1, b: [1, 2] })).toEqual({ run: 2 })
  expect(runs).toBe(2)

  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("operations").take(10))
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
  })
  await t.mutation(internal.operations.prune, {})
  expect(await t.run((ctx) => ctx.db.query("operations").take(10))).toEqual([])
  expect(await once("grant:a", { a: 2 })).toEqual({ run: 3 })
})

test("agent writes over HTTP return the first result for a retried idempotency key", async () => {
  const { t, workspaceId } = await fixture()
  const { digestToken } = await import("./agentAccess")
  const bearer = "e".repeat(64)
  await t.run(async (ctx) => {
    await ctx.db.insert("agentGrants", {
      workspaceId,
      owner: "owner",
      digest: await digestToken(bearer),
      scope: "readwrite",
      state: "active",
      expiresAt: Date.now() + 60000,
    })
  })
  const send = (method: string, path: string, body: Value) =>
    t.fetch(path, {
      method,
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
  const create = {
    name: "Leads",
    fields: [{ id: "name", label: "Name", type: "text" }],
    idempotencyKey: "create-leads",
  }
  const first = await send("POST", "/agent/collections", create)
  expect(first.status).toBe(201)
  const { id } = await first.json()
  const retry = await send("POST", "/agent/collections", create)
  expect(retry.status).toBe(201)
  expect((await retry.json()).id).toBe(id)
  const reused = await send("POST", "/agent/collections", {
    ...create,
    name: "Other",
  })
  expect(reused.status).toBe(409)
  expect((await reused.json()).error).toContain("different request")

  const { id: recordId } = await (
    await send("POST", "/agent/records", {
      collectionId: id,
      values: { name: "A" },
    })
  ).json()
  const update = {
    collectionId: id,
    recordId,
    expectedRevision: 1,
    values: { name: "B" },
    idempotencyKey: "rename-a",
  }
  const updated = await send("PATCH", "/agent/records", update)
  expect(await updated.json()).toEqual({ status: "updated", revision: 2 })
  // The retry returns the first result, not a revision conflict.
  const again = await send("PATCH", "/agent/records", update)
  expect(again.status).toBe(200)
  expect(await again.json()).toEqual({ status: "updated", revision: 2 })
  const { idempotencyKey: _key, ...withoutKey } = update
  expect((await send("PATCH", "/agent/records", withoutKey)).status).toBe(409)
  expect(
    (await send("PATCH", "/agent/records", { ...update, idempotencyKey: "" }))
      .status
  ).toBe(400)
}, 20_000)
