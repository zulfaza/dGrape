/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { Schema } from "effect"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import { checkRecordValues, type CollectionField } from "./lib/collectionDomain"
import { checkQuery } from "./lib/recordQuery"
import { parseCreateCollection } from "./lib/agentRequests"
import { Field } from "../src/mcp/agent-api"
import { stageSnapshotChunk, upsertSourceRecord } from "./lib/recordPublication"
const modules = import.meta.glob("./**/*.ts")
const fields: CollectionField[] = [
  {
    id: "amount_minor",
    label: "Amount (minor units)",
    type: "integer",
    indexed: true,
  },
  { id: "currency", label: "Currency", type: "currency", indexed: true },
]

test("HTTP and MCP accept the same exact scalar kinds", () => {
  expect(
    parseCreateCollection({ name: "Transactions", fields })?.fields
  ).toEqual(fields)
  for (const field of fields)
    expect(Schema.decodeUnknownSync(Field)(field)).toEqual(field)
  expect(
    parseCreateCollection({
      name: "Bad",
      fields: [{ id: "x", label: "X", type: "money" }],
    })
  ).toBeNull()
})

test("safe integer boundaries and currency shape apply to records and query bounds", () => {
  for (const amount of [
    0,
    -123,
    Number.MAX_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
  ])
    expect(
      checkRecordValues(fields, { amount_minor: amount, currency: "USD" }).ok
    ).toBe(true)
  for (const amount of [0.1, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN, "123"])
    expect(
      checkRecordValues(fields, { amount_minor: amount, currency: "USD" }).ok
    ).toBe(false)
  for (const currency of ["usd", "US", " USD", "USDD", 123, "💵"])
    expect(checkRecordValues(fields, { amount_minor: 100, currency }).ok).toBe(
      false
    )
  expect(
    checkQuery(fields, {
      fieldId: "amount_minor",
      order: "asc",
      where: { lower: { value: 0.1, inclusive: true } },
    }).ok
  ).toBe(false)
  expect(
    checkQuery(fields, {
      fieldId: "currency",
      order: "asc",
      where: { eq: "usd" },
    }).ok
  ).toBe(false)
})

test("human, agent, source upserts and snapshot staging enforce exact values and keep projections", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Mine",
  })
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Transactions",
    fields,
  })
  const recordId = await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { amount_minor: -125, currency: "USD" },
  })
  await expect(
    owner.mutation(api.workspaces.createRecord, {
      collectionId,
      values: { amount_minor: 1.25, currency: "USD" },
    })
  ).rejects.toThrow("safe integer")
  await expect(
    owner.mutation(api.workspaces.updateRecord, {
      collectionId,
      recordId,
      expectedRevision: 1,
      values: { amount_minor: 125, currency: "usd" },
    })
  ).rejects.toThrow("currency code")
  const rows = await owner.query(api.workspaces.queryRecords, {
    collectionId,
    query: { fieldId: "amount_minor", order: "asc", where: { eq: -125 } },
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(rows.page.map((row) => row._id)).toEqual([recordId])
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
  expect(
    await t.mutation(internal.agentWrites.createRecord, {
      digest: "test",
      collectionId,
      values: { amount_minor: 0.5, currency: "USD" },
      idempotencyKey: "bad",
    })
  ).toMatchObject({ status: "invalid" })
  const collection = await t.run((ctx) => ctx.db.get(collectionId))
  if (!collection) throw new Error("Missing collection")
  await expect(
    t.run((ctx) =>
      upsertSourceRecord(ctx, {
        collection,
        source: "bank",
        key: "x",
        expectedRevision: null,
        values: { amount_minor: 0.01, currency: "USD" },
      })
    )
  ).rejects.toThrow("safe integer")
  await expect(
    t.run((ctx) =>
      stageSnapshotChunk(ctx, {
        collection,
        generation: "bad",
        chunkId: "a",
        values: [{ amount_minor: 1, currency: "usd" }],
      })
    )
  ).rejects.toThrow("currency code")
  expect(
    (await owner.query(api.workspaces.getRecord, { collectionId, recordId }))
      .revision
  ).toBe(1)
})
