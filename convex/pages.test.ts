/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { api } from "./_generated/api"
const modules = import.meta.glob("./**/*.ts")

async function fixture() {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const other = t.withIdentity({ tokenIdentifier: "other" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Pages",
  })
  const otherWorkspaceId = await other.mutation(api.workspaces.create, {
    name: "Other",
  })
  return { t, owner, other, workspaceId, otherWorkspaceId }
}

test("page drafts, publish, rollback and history preserve immutable definitions and enforce conflicts", async () => {
  const { owner, workspaceId } = await fixture()
  const definition = {
    title: "First",
    blocks: [{ kind: "markdown", text: "Original" }],
  }
  const first = await owner.mutation(api.pages.save, {
    workspaceId,
    definition: {
      title: definition.title,
      blocks: [{ kind: "markdown", text: "Original" }],
    },
  })
  expect(
    (await owner.query(api.pages.get, { pageId: first.pageId })).version
  ).toBeNull()
  expect(
    (await owner.query(api.pages.get, { pageId: first.pageId, revision: 1 }))
      .version?.definition.title
  ).toBe("First")
  await owner.mutation(api.pages.publish, {
    ...first,
    expectedRevision: 1,
    expectedPublishedRevision: null,
  })
  const second = await owner.mutation(api.pages.save, {
    workspaceId,
    pageId: first.pageId,
    expectedRevision: 1,
    definition: {
      title: "Second",
      blocks: [{ kind: "markdown", text: "Changed" }],
    },
  })
  expect(
    (await owner.query(api.pages.get, { pageId: first.pageId })).version
      ?.definition.title
  ).toBe("First")
  await expect(
    owner.mutation(api.pages.save, {
      workspaceId,
      pageId: first.pageId,
      expectedRevision: 1,
      definition: { title: "Stale", blocks: [] },
    })
  ).rejects.toThrow("revision conflict")
  await expect(
    owner.mutation(api.pages.publish, {
      ...second,
      expectedRevision: 2,
      expectedPublishedRevision: null,
    })
  ).rejects.toThrow("revision conflict")
  await owner.mutation(api.pages.publish, {
    ...second,
    expectedRevision: 2,
    expectedPublishedRevision: 1,
  })
  expect(
    (await owner.query(api.pages.get, { pageId: first.pageId })).version
      ?.definition.title
  ).toBe("Second")
  await owner.mutation(api.pages.publish, {
    ...first,
    expectedRevision: 2,
    expectedPublishedRevision: 2,
  })
  expect(
    (await owner.query(api.pages.get, { pageId: first.pageId })).version
      ?.definition.title
  ).toBe("First")
  const history = await owner.query(api.pages.history, {
    pageId: first.pageId,
    paginationOpts: { numItems: 20, cursor: null },
  })
  expect(history.page.map((row) => row.definition.title)).toEqual([
    "Second",
    "First",
  ])
})

test("page boundaries refuse other workspaces, including artifact and query references", async () => {
  const { t, owner, other, workspaceId, otherWorkspaceId } = await fixture()
  const page = await owner.mutation(api.pages.save, {
    workspaceId,
    definition: { title: "Private", blocks: [] },
  })
  await expect(
    other.query(api.pages.get, { pageId: page.pageId })
  ).rejects.toThrow("Workspace access denied")
  await expect(
    other.query(api.pages.history, {
      pageId: page.pageId,
      paginationOpts: { numItems: 20, cursor: null },
    })
  ).rejects.toThrow("Workspace access denied")
  await expect(
    other.mutation(api.pages.publish, {
      ...page,
      expectedRevision: 1,
      expectedPublishedRevision: null,
    })
  ).rejects.toThrow("Workspace access denied")
  await expect(
    other.mutation(api.pages.save, {
      workspaceId: otherWorkspaceId,
      pageId: page.pageId,
      expectedRevision: 1,
      definition: { title: "Stolen", blocks: [] },
    })
  ).rejects.toThrow("Page access denied")
  const artifactId = await t.run((ctx) =>
    ctx.db.insert("artifacts", {
      workspaceId: otherWorkspaceId,
      key: "private",
      name: "private.txt",
      size: 5,
      contentType: "text/plain",
      createdBy: { kind: "user", userId: "other" },
    })
  )
  await expect(
    owner.mutation(api.pages.save, {
      workspaceId,
      definition: {
        title: "Bad",
        blocks: [{ kind: "artifact", title: "Private", artifactId }],
      },
    })
  ).rejects.toThrow("Artifact is unavailable")
})

test("page bindings pin query revisions, validate result fields and expose schema invalidation", async () => {
  const { t, owner, workspaceId, otherWorkspaceId } = await fixture()
  const collectionId = await t.run((ctx) =>
    ctx.db.insert("collections", {
      workspaceId,
      name: "Numbers",
      definition: {
        version: 1,
        fields: [
          { id: "amount", label: "Amount", type: "number", indexed: true },
        ],
      },
    })
  )
  const saved = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Amounts",
    query: { fieldId: "amount", order: "asc" },
  })
  const page = await owner.mutation(api.pages.save, {
    workspaceId,
    definition: {
      title: "Numbers",
      blocks: [
        {
          kind: "metric",
          title: "Total",
          binding: saved,
          field: "amount",
          unit: "USD",
          operation: "sum",
        },
      ],
    },
  })
  await owner.mutation(api.pages.publish, {
    ...page,
    expectedRevision: 1,
    expectedPublishedRevision: null,
  })
  await expect(
    owner.mutation(api.pages.save, {
      workspaceId,
      definition: {
        title: "Bad",
        blocks: [
          {
            kind: "chart",
            title: "Bad",
            binding: saved,
            chart: {
              type: "bar",
              labelField: "missing",
              valueField: "amount",
              unit: "USD",
            },
          },
        ],
      },
    })
  ).rejects.toThrow("Chart requires")
  await t.run((ctx) =>
    ctx.db.insert("workspaceMembers", {
      workspaceId: otherWorkspaceId,
      userId: "owner",
      role: "owner",
    })
  )
  await expect(
    owner.mutation(api.pages.save, {
      workspaceId: otherWorkspaceId,
      definition: {
        title: "Bad",
        blocks: [
          { kind: "table", title: "Bad", binding: saved, fields: ["amount"] },
        ],
      },
    })
  ).rejects.toThrow("Query is unavailable in this workspace")
  await t.run((ctx) =>
    ctx.db.patch(collectionId, { definition: { version: 2, fields: [] } })
  )
  const invalid = await owner.query(api.pages.get, { pageId: page.pageId })
  expect(invalid.bindings[0]).toContain("schema is stale")
  await expect(
    owner.mutation(api.pages.publish, {
      ...page,
      expectedRevision: 1,
      expectedPublishedRevision: 1,
    })
  ).rejects.toThrow("schema is stale")
})

test("live blocks authorize stored addresses, bound results and report stale sources", async () => {
  const { t, owner, other, workspaceId } = await fixture()
  const collectionId = await t.run((ctx) =>
    ctx.db.insert("collections", {
      workspaceId,
      name: "Live",
      definition: {
        version: 1,
        fields: [
          { id: "amount", label: "Amount", type: "number", indexed: true },
        ],
      },
    })
  )
  const binding = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Live",
    query: { fieldId: "amount", order: "asc" },
  })
  const page = await owner.mutation(api.pages.save, {
    workspaceId,
    definition: {
      title: "Live",
      blocks: [{ kind: "table", title: "Rows", binding, fields: ["amount"] }],
    },
  })
  const address = { pageId: page.pageId, revision: 1, blockIndex: 0 }
  expect(
    (await owner.query(api.pages.liveBlock, address)).result?.page
  ).toEqual([])
  await expect(other.query(api.pages.liveBlock, address)).rejects.toThrow(
    "Workspace access denied"
  )
  await expect(
    owner.query(api.pages.liveBlock, { ...address, blockIndex: 0.5 })
  ).rejects.toThrow("Invalid block address")
  expect(
    (await owner.query(api.pages.liveBlock, { ...address, revision: 99 }))
      .problem
  ).toContain("unavailable")
  await t.run(async (ctx) => {
    for (let i = 0; i < 60; i++) {
      const recordId = await ctx.db.insert("collectionRecords", {
        collectionId,
        schemaVersion: 1,
        revision: 1,
        values: { amount: i },
      })
      await ctx.db.insert("recordIndexEntries", {
        collectionId,
        recordId,
        fieldId: "amount",
        value: i,
      })
    }
  })
  const live = await owner.query(api.pages.liveBlock, address)
  expect(live.result?.page).toHaveLength(50)
  expect(live.result?.completeness).toBe("partial")
  expect(await owner.query(api.pages.sources, { workspaceId })).toHaveLength(1)
  await t.run((ctx) =>
    ctx.db.patch(collectionId, { definition: { version: 2, fields: [] } })
  )
  expect((await owner.query(api.pages.liveBlock, address)).problem).toContain(
    "schema is stale"
  )
  expect(await owner.query(api.pages.sources, { workspaceId })).toEqual([])
})
