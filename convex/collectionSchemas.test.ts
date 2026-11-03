/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import { publishCompatibleSchema } from "./lib/collectionSchemas"
import type { CollectionField } from "./lib/collectionDomain"
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
})

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
  expect(capabilities.scope).toBe("readonly")
  for (const capability of capabilities.capabilities)
    expect(capability.allowed).toBe(capability.access === "read")
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
})
