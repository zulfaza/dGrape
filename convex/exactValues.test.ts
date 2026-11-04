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
import type { Id } from "./_generated/dataModel"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import {
  checkRecordValues,
  type CollectionField,
  type RecordValues,
} from "./lib/collectionDomain"
import type { CollectionTemplate } from "./lib/collectionTemplates"
import { checkQuery } from "./lib/recordQuery"
import {
  parseCreateCollection,
  parseCreateRecord,
  parseObjectValue,
} from "./lib/agentRequests"
import { Field } from "../src/mcp/agent-api"
import * as Queries from "./lib/agentQueryTransport"
import { stageSnapshotChunk, upsertSourceRecord } from "./lib/recordPublication"
import { toCsv, toJson } from "../src/lib/record-export"
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

test("object values have limits on depth, size, and keys, and are never indexed", async () => {
  const objectFields: CollectionField[] = [
    { id: "meta", label: "Meta", type: "object" },
  ]
  const deep = { a: { b: [{ c: 1 }] } }
  expect(checkRecordValues(objectFields, { meta: deep }).ok).toBe(true)
  expect(
    parseCreateRecord({ collectionId: "c", values: { meta: deep } })?.values
  ).toEqual({ meta: deep })
  expect(parseObjectValue({ a: { b: [{ c: [1] }] } })).toBeNull()
  expect(parseObjectValue([1])).toBeNull()
  expect(parseObjectValue({ a: undefined })).toBeNull()
  expect(
    parseCreateRecord({ collectionId: "c", values: { meta: { a: [[[[1]]]] } } })
  ).toBeNull()
  for (const meta of [
    { _id: 1 },
    { $set: 1 },
    { "": 1 },
    { é: 1 },
    JSON.parse('{"__proto__": 1}'),
    { a: Infinity },
    { a: "x".repeat(10_000) },
  ]) {
    const parsed = parseObjectValue(meta)
    expect(parsed).not.toBeNull()
    expect(
      parsed !== null && checkRecordValues(objectFields, { meta: parsed }).ok
    ).toBe(false)
  }
  for (const meta of ["{}", ["a"], 1])
    expect(checkRecordValues(objectFields, { meta }).ok).toBe(false)
  expect(
    parseCreateCollection({ name: "Meta", fields: objectFields })?.fields
  ).toEqual(objectFields)
  expect(Schema.decodeUnknownSync(Field)(objectFields[0])).toEqual(
    objectFields[0]
  )

  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Jobs",
  })
  await expect(
    owner.mutation(api.workspaces.createCollection, {
      workspaceId,
      name: "Bad",
      fields: [{ id: "meta", label: "Meta", type: "object", indexed: true }],
    })
  ).rejects.toThrow("cannot be indexed")
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Meta",
    fields: [...objectFields, { id: "name", label: "Name", type: "text" }],
  })
  const recordId = await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { meta: { ...deep, note: null }, name: "x" },
  })
  const stored = await owner.query(api.workspaces.getRecord, {
    collectionId,
    recordId,
  })
  expect(stored?.values.meta).toEqual({ ...deep, note: null })
  await expect(
    owner.mutation(api.workspaces.addField, {
      collectionId,
      field: { id: "more", label: "More", type: "object", indexed: true },
    })
  ).rejects.toThrow("cannot be indexed")
})

test("secret references point to workspace secrets and stay out of indexes and exports", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Jobs",
  })
  const otherWorkspaceId = await owner.mutation(api.workspaces.create, {
    name: "Other",
  })
  const prepare = (id: typeof workspaceId, isPrivate: boolean) =>
    owner.mutation(api.secrets.prepare, {
      workspaceId: id,
      label: "API",
      private: isPrivate,
    })
  const shared = await prepare(workspaceId, false)
  const personal = await prepare(workspaceId, true)
  const foreign = await prepare(otherWorkspaceId, false)
  const removed = await prepare(workspaceId, false)
  await owner.mutation(api.secrets.beginDelete, {
    secretRef: removed,
    revision: 1,
  })
  await expect(
    owner.mutation(api.workspaces.createCollection, {
      workspaceId,
      name: "Bad",
      fields: [{ id: "key", label: "Key", type: "secretRef", indexed: true }],
    })
  ).rejects.toThrow("cannot be indexed")
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Services",
    fields: [
      { id: "name", label: "Name", type: "text" },
      { id: "key", label: "Key", type: "secretRef" },
    ],
  })
  for (const key of [personal, foreign, removed, "not-an-id"])
    await expect(
      owner.mutation(api.workspaces.createRecord, {
        collectionId,
        values: { name: "x", key },
      })
    ).rejects.toThrow("workspace secret")
  const recordId = await owner.mutation(api.workspaces.createRecord, {
    collectionId,
    values: { name: "GitHub", key: shared },
  })
  const record = await owner.query(api.workspaces.getRecord, {
    collectionId,
    recordId,
  })
  const collection = await owner.query(api.workspaces.getCollection, {
    collectionId,
  })
  expect(record?.values.key).toBe(shared)
  if (!record) throw new Error("Expected the record")
  expect(toCsv(collection, [record])).not.toContain(shared)
  expect(toJson(collection, [record])).not.toContain(shared)
  await expect(
    owner.query(api.workspaces.queryRecords, {
      collectionId,
      query: { fieldId: "key", order: "asc" },
      paginationOpts: { numItems: 10, cursor: null },
    })
  ).rejects.toThrow("is not indexed")
})

test("record writes reject likely credentials with messages that omit the value", async () => {
  const textFields: CollectionField[] = [
    { id: "note", label: "Note", type: "text" },
    { id: "meta", label: "Meta", type: "object", optional: true },
  ]
  // Built at run time, so the file has no token-shaped text.
  const credentials = [
    ["-----BEGIN ", "RSA PRIVATE KEY-----\nabc"],
    ["AKIA", "ABCDEFGHIJKLMNOP"],
    ["ghp_", "a".repeat(36)],
    ["github_pat_", "a".repeat(30)],
    ["xoxb-", "1234567890-abc"],
    ["sk_live_", "a".repeat(24)],
    ["sk-ant-", "a".repeat(30)],
    ["AIza", "a".repeat(35)],
    ["eyJhbGciOi", "J9.eyJzdWIiOiIx.abcdefghijk"],
  ].map((parts) => parts.join(""))
  for (const credential of credentials) {
    const cases: RecordValues[] = [
      { note: `token: ${credential}` },
      { note: "x", meta: { headers: [{ value: credential }] } },
    ]
    for (const values of cases) {
      const checked = checkRecordValues(textFields, values)
      expect(checked).toMatchObject({ ok: false })
      expect(checked.ok ? "" : checked.message).toContain("credential")
      expect(checked.ok ? "" : checked.message).not.toContain(credential)
    }
  }
  for (const note of ["ask-me later", "AKIA short", "sketch", "eyJ"])
    expect(checkRecordValues(textFields, { note }).ok).toBe(true)

  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Jobs",
  })
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Notes",
    fields: textFields,
  })
  await expect(
    owner.mutation(api.workspaces.createRecord, {
      collectionId,
      values: { note: credentials[2] },
    })
  ).rejects.toThrow("looks like it contains a credential (GitHub token)")
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
  const label = (id: string) =>
    owner.query(api.workspaces.referenceLabel, { collectionId: jobs, id })
  expect(await label(company)).toBe("Example")
  expect(await label(artifact)).toBe("offer.pdf")
  expect(await label(foreign)).toBeNull()
  expect(await label(foreignArtifact)).toBeNull()
  expect(await label("not-an-id")).toBeNull()
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
  const created = new Map<CollectionTemplate["id"], Id<"collections">>()
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
    created.set(template.id, collectionId)
  }
  // Template dates are date fields: text that is not a date is refused.
  const badDates: Array<[CollectionTemplate["id"], RecordValues]> = [
    [
      "applications",
      {
        company: "Example",
        role: "Engineer",
        stage: "Applied",
        source: "Website",
        date: "03/11/2026",
      },
    ],
    [
      "transactions",
      { date: "03/11/2026", amount: -123, currency: "USD", category: "Food" },
    ],
  ]
  for (const [id, values] of badDates) {
    const collectionId = created.get(id)
    if (!collectionId) throw new Error(`Template ${id} missing`)
    await expect(
      owner.mutation(api.workspaces.createRecord, { collectionId, values })
    ).rejects.toThrow("date")
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
