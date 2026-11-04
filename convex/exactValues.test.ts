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
import * as Queries from "./lib/agentQueryTransport"
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

test("timestamps are safe integer milliseconds and dates are real YYYY-MM-DD dates", () => {
  const dated: CollectionField[] = [
    { id: "at", label: "At", type: "timestamp", indexed: true },
    { id: "day", label: "Day", type: "date", indexed: true },
  ]
  expect(
    parseCreateCollection({ name: "Dated", fields: dated })?.fields
  ).toEqual(dated)
  for (const field of dated) {
    expect(Schema.decodeUnknownSync(Field)(field)).toEqual(field)
    expect(Schema.decodeUnknownSync(Queries.Field)(field)).toEqual(field)
  }
  for (const at of [0, -1, Date.UTC(2026, 10, 4), 8_640_000_000_000_000])
    expect(checkRecordValues(dated, { at, day: "2024-02-29" }).ok).toBe(true)
  expect(checkRecordValues(dated, { at: 0, day: "0004-02-29" }).ok).toBe(true)
  for (const at of [1.5, 8_640_000_000_000_001, "2026-11-04T00:00:00Z", NaN])
    expect(checkRecordValues(dated, { at, day: "2026-11-04" }).ok).toBe(false)
  for (const day of ["2026-02-29", "2026-13-01", "2026-1-01", "20261104", 1])
    expect(checkRecordValues(dated, { at: 0, day }).ok).toBe(false)
  expect(
    checkQuery(dated, {
      fieldId: "day",
      order: "asc",
      where: { lower: { value: "2026-11-31", inclusive: true } },
    }).ok
  ).toBe(false)
})

test("select values are options and multi-select values list different options", () => {
  const chosen: CollectionField[] = [
    {
      id: "stage",
      label: "Stage",
      type: "select",
      options: ["applied", "offer"],
    },
    {
      id: "tags",
      label: "Tags",
      type: "multiSelect",
      options: ["remote", "senior"],
      indexed: true,
    },
  ]
  expect(
    parseCreateCollection({ name: "Jobs", fields: chosen })?.fields
  ).toEqual(chosen)
  for (const field of chosen) {
    expect(Schema.decodeUnknownSync(Field)(field)).toEqual(field)
    expect(Schema.decodeUnknownSync(Queries.Field)(field)).toEqual(field)
  }
  expect(
    parseCreateCollection({
      name: "Bad",
      fields: [{ id: "x", label: "X", type: "select" }],
    })
  ).toBeNull()
  expect(
    parseCreateCollection({
      name: "Bad",
      fields: [{ id: "x", label: "X", type: "text", options: ["a"] }],
    })
  ).toBeNull()
  for (const tags of [[], ["remote"], ["senior", "remote"]])
    expect(checkRecordValues(chosen, { stage: "offer", tags }).ok).toBe(true)
  for (const tags of [["remote", "remote"], ["junior"], "remote"])
    expect(checkRecordValues(chosen, { stage: "offer", tags }).ok).toBe(false)
  for (const stage of ["Offer", "", ["offer"]])
    expect(checkRecordValues(chosen, { stage, tags: [] }).ok).toBe(false)
  expect(
    checkQuery(chosen, {
      fieldId: "tags",
      order: "asc",
      where: { eq: "remote" },
    }).ok
  ).toBe(true)
  expect(checkQuery(chosen, { fieldId: "tags", order: "asc" }).ok).toBe(false)
  expect(
    checkQuery(chosen, {
      fieldId: "tags",
      order: "asc",
      where: { eq: "junior" },
    }).ok
  ).toBe(false)
})

test("collections reject bad options and multi-select queries find each chosen option", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Jobs",
  })
  for (const options of [[], ["a", " a "], ["", "b"], ["__none"], [" __any "]])
    await expect(
      owner.mutation(api.workspaces.createCollection, {
        workspaceId,
        name: "Bad",
        fields: [{ id: "x", label: "X", type: "select", options }],
      })
    ).rejects.toThrow("option")
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Jobs",
    fields: [
      {
        id: "tags",
        label: "Tags",
        type: "multiSelect",
        options: [" remote ", "senior"],
        indexed: true,
      },
    ],
  })
  const collection = await owner.query(api.workspaces.getCollection, {
    collectionId,
  })
  expect(collection.definition.fields[0]).toMatchObject({
    options: ["remote", "senior"],
  })
  const both = await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { tags: ["remote", "senior"] },
  })
  const remote = await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { tags: ["remote"] },
  })
  const read = (eq: string) =>
    owner.query(api.workspaces.queryRecords, {
      collectionId,
      query: { fieldId: "tags", order: "asc", where: { eq } },
      paginationOpts: { numItems: 10, cursor: null },
    })
  expect((await read("remote")).page.map((row) => row._id)).toEqual([
    both,
    remote,
  ])
  expect((await read("senior")).page.map((row) => row._id)).toEqual([both])
})

test("references stay in their workspace, and a referenced record or artifact cannot be deleted", async () => {
  const reference = {
    id: "company",
    label: "Company",
    type: "recordReference",
    collectionId: "anything",
  }
  expect(
    parseCreateCollection({ name: "Jobs", fields: [reference] })?.fields
  ).toEqual([reference])
  expect(Schema.decodeUnknownSync(Field)(reference)).toEqual(reference)
  expect(Schema.decodeUnknownSync(Queries.Field)(reference)).toEqual(reference)
  expect(
    parseCreateCollection({
      name: "Bad",
      fields: [{ id: "x", label: "X", type: "recordReference" }],
    })
  ).toBeNull()
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Mine",
  })
  const otherWorkspaceId = await owner.mutation(api.workspaces.create, {
    name: "Other",
  })
  const companies = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Companies",
    fields: [{ id: "name", label: "Name", type: "text" }],
  })
  const elsewhere = await owner.mutation(api.workspaces.createCollection, {
    workspaceId: otherWorkspaceId,
    name: "Elsewhere",
    fields: [{ id: "name", label: "Name", type: "text" }],
  })
  await expect(
    owner.mutation(api.workspaces.createCollection, {
      workspaceId,
      name: "Bad",
      fields: [
        {
          id: "company",
          label: "Company",
          type: "recordReference",
          collectionId: elsewhere,
        },
      ],
    })
  ).rejects.toThrow("not in this workspace")
  const jobs = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Jobs",
    fields: [
      {
        id: "company",
        label: "Company",
        type: "recordReference",
        collectionId: companies,
        indexed: true,
      },
      {
        id: "offer",
        label: "Offer",
        type: "artifactReference",
        optional: true,
      },
    ],
  })
  const company = await owner.mutation(api.workspaces.createRecord, {
    collectionId: companies,
    values: { name: "Example" },
  })
  const foreign = await owner.mutation(api.workspaces.createRecord, {
    collectionId: elsewhere,
    values: { name: "Foreign" },
  })
  const artifact = await t.run((ctx) =>
    ctx.db.insert("artifacts", {
      workspaceId,
      key: "k",
      name: "offer.pdf",
      contentType: "application/pdf",
      size: 1,
      createdBy: { kind: "user", userId: "owner" },
    })
  )
  const foreignArtifact = await t.run((ctx) =>
    ctx.db.insert("artifacts", {
      workspaceId: otherWorkspaceId,
      key: "f",
      name: "other.pdf",
      contentType: "application/pdf",
      size: 1,
      createdBy: { kind: "user", userId: "owner" },
    })
  )
  const invalidValues: RecordValues[] = [
    { company: foreign },
    { company: "not-an-id" },
    { company, offer: foreignArtifact },
  ]
  for (const values of invalidValues)
    await expect(
      owner.mutation(api.workspaces.createRecord, {
        collectionId: jobs,
        values,
      })
    ).rejects.toThrow("references")
  const job = await owner.mutation(api.workspaces.createRecord, {
    collectionId: jobs,
    values: { company, offer: artifact },
  })
  const referencing = await owner.query(api.workspaces.queryRecords, {
    collectionId: jobs,
    query: { fieldId: "company", order: "asc", where: { eq: company } },
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(referencing.page.map((row) => row._id)).toEqual([job])
  expect(
    await owner.mutation(api.workspaces.deleteRecord, {
      collectionId: companies,
      recordId: company,
      expectedRevision: 1,
    })
  ).toBe("referenced")
  await t.run((ctx) =>
    ctx.db.insert("agentGrants", {
      workspaceId,
      owner: "owner",
      digest: "refs",
      scope: "readwrite",
      state: "active",
      expiresAt: Date.now() + 60_000,
    })
  )
  expect(
    await t.mutation(internal.agentWrites.createCollection, {
      digest: "refs",
      name: "Bad",
      fields: [
        {
          id: "company",
          label: "Company",
          type: "recordReference",
          collectionId: "bogus",
        },
      ],
    })
  ).toMatchObject({ status: "invalid" })
  expect(
    await t.mutation(internal.agentWrites.deleteRecord, {
      digest: "refs",
      collectionId: companies,
      recordId: company,
      expectedRevision: 1,
    })
  ).toEqual({ status: "referenced", recordId: job })
  expect(
    await owner.mutation(api.artifacts.remove, { artifactId: artifact })
  ).toBe("referenced")
  expect(
    await owner.mutation(api.workspaces.deleteRecord, {
      collectionId: jobs,
      recordId: job,
      expectedRevision: 1,
    })
  ).toBe("deleted")
  expect(
    await owner.mutation(api.workspaces.deleteRecord, {
      collectionId: companies,
      recordId: company,
      expectedRevision: 1,
    })
  ).toBe("deleted")
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

test("audit events name the actor and objects but never record values", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Audited",
  })
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Transactions",
    fields,
  })
  const recordId = await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { amount_minor: 4242, currency: "USD" },
  })
  const grantId = await t.run((ctx) =>
    ctx.db.insert("agentGrants", {
      workspaceId,
      owner: "owner",
      digest: "digest-x9",
      scope: "readwrite",
      state: "active",
      expiresAt: Date.now() + 60_000,
    })
  )
  const created = await t.mutation(internal.agentWrites.createRecord, {
    digest: "digest-x9",
    collectionId,
    values: { amount_minor: 7, currency: "EUR" },
    idempotencyKey: "once",
  })
  if (created.status !== "created") throw new Error("Agent write failed")
  // A retry and a rejected write change nothing, so they add no event.
  await t.mutation(internal.agentWrites.createRecord, {
    digest: "digest-x9",
    collectionId,
    values: { amount_minor: 7, currency: "EUR" },
    idempotencyKey: "once",
  })
  await t.mutation(internal.agentWrites.createRecord, {
    digest: "digest-x9",
    collectionId,
    values: { amount_minor: 0.5, currency: "EUR" },
  })
  const saved = await t.mutation(internal.agentQueries.save, {
    digest: "digest-x9",
    collectionId,
    name: "Big spends",
    query: { fieldId: "amount_minor", order: "desc" },
  })
  const events = await owner.query(api.auditEvents.list, {
    workspaceId,
    paginationOpts: { numItems: 10, cursor: null },
  })
  const user = { kind: "user", userId: "owner" }
  const agent = { kind: "agent", grantId, registrationId: null, owner: "owner" }
  expect(events.page.map(({ actor, event }) => ({ actor, event }))).toEqual([
    {
      actor: agent,
      event: { operation: "query.save", queryId: saved.queryId, revision: 1 },
    },
    {
      actor: agent,
      event: { operation: "record.create", collectionId, recordId: created.id },
    },
    {
      actor: user,
      event: { operation: "record.create", collectionId, recordId },
    },
    { actor: user, event: { operation: "collection.create", collectionId } },
    { actor: user, event: { operation: "workspace.create" } },
  ])
  const stored = JSON.stringify(events.page)
  for (const secret of [
    "4242",
    "EUR",
    "USD",
    "digest-x9",
    "Transactions",
    "Big spends",
  ])
    expect(stored).not.toContain(secret)
  await expect(
    t
      .withIdentity({ tokenIdentifier: "stranger" })
      .query(api.auditEvents.list, {
        workspaceId,
        paginationOpts: { numItems: 10, cursor: null },
      })
  ).rejects.toThrow("Workspace access denied")
})

test("self references do not hide another record's reference", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "People",
  })
  const people = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "People",
    fields: [{ id: "name", label: "Name", type: "text" }],
  })
  for (const id of ["manager", "mentor"])
    await owner.mutation(api.workspaces.addField, {
      collectionId: people,
      field: { id, label: id, type: "recordReference", collectionId: people },
    })
  const lead = await owner.mutation(api.workspaces.createRecord, {
    collectionId: people,
    values: { name: "Lead" },
  })
  await owner.mutation(api.workspaces.updateRecord, {
    collectionId: people,
    recordId: lead,
    expectedRevision: 1,
    values: { name: "Lead", manager: lead, mentor: lead },
  })
  await owner.mutation(api.workspaces.createRecord, {
    collectionId: people,
    values: { name: "Report", manager: lead },
  })
  expect(
    await owner.mutation(api.workspaces.deleteRecord, {
      collectionId: people,
      recordId: lead,
      expectedRevision: 2,
    })
  ).toBe("referenced")
})
