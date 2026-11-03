import {
  collectionTemplates,
  githubTemplateRecipe,
} from "./lib/collectionTemplates"
import { githubRoutes } from "./lib/githubConnector"
import { transform, validateRecipe } from "./lib/recipeDomain"
/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import { Schema } from "effect"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import {
  checkRecordValues,
  type CollectionField,
  type RecordValues,
} from "./lib/collectionDomain"
import type { CollectionTemplate } from "./lib/collectionTemplates"
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

/** Runs a connector-shaped GitHub item through the template recipe's map step. */
function githubRow(template: CollectionTemplate, collectionId: string) {
  if (template.source.kind !== "github") throw new Error("Expected GitHub")
  const recipe = githubTemplateRecipe(template, {
    connectionId: "connection",
    collectionId,
  })
  validateRecipe(recipe)
  const [fetchStep, map] = recipe.steps
  if (fetchStep?.kind !== "fetch" || map?.kind !== "map")
    throw new Error("Expected fetch and map steps")
  const read = githubRoutes.find((route) => route.id === fetchStep.route)
  expect(read?.response?.next).toEqual({ kind: "none" })
  for (const field of template.fields) expect(read?.fields).toContain(field.id)
  const [row] = transform(
    [
      {
        id: 4_000_000_001,
        number: 12,
        title: "Add connector",
        state: "open",
        html_url: "https://github.com/o/r/pull/12",
        repository_url: "https://api.github.com/repos/o/r",
        created_at: "2026-11-01T10:00:00Z",
        updated_at: "2026-11-02T10:00:00Z",
        unmapped: "dropped",
      },
    ],
    map,
    recipe.limits
  )
  expect(row).not.toHaveProperty("unmapped")
  return row ?? {}
}

test("templates create valid collections through HTTP and MCP contracts", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ subject: "template-owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Templates",
  })
  for (const template of collectionTemplates()) {
    expect(parseCreateCollection(template)?.fields).toEqual(template.fields)
    for (const field of template.fields)
      expect(Schema.decodeUnknownSync(Field)(field)).toEqual(field)
    const collectionId = await owner.mutation(api.workspaces.createCollection, {
      workspaceId,
      name: template.name,
      fields: template.fields,
    })
    const examples: Record<CollectionTemplate["id"], () => RecordValues> = {
      transactions: () => ({
        date: "2026-11-03",
        amount: -123,
        currency: "USD",
        category: "Food",
      }),
      applications: () => ({
        company: "Example",
        role: "Engineer",
        stage: "Applied",
        source: "Website",
        date: "2026-11-03",
      }),
      github_pull_requests: () => githubRow(template, String(collectionId)),
    }
    const values = examples[template.id]()
    const recordId = await owner.mutation(api.workspaces.createRecord, {
      collectionId,
      values,
    })
    expect(
      (await owner.query(api.workspaces.getRecord, { collectionId, recordId }))
        .values
    ).toEqual(values)
  }
  expect(collectionTemplates()[0]?.fields[0]?.label).toBe("Company")
})
