/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { api } from "./_generated/api"
import * as Pages from "./lib/agentPageTransport"
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
  await expect(
    owner.mutation(api.pages.rollback, {
      ...second,
      expectedRevision: 2,
      expectedPublishedRevision: 2,
    })
  ).rejects.toThrow("Rollback requires a revision older")
  await expect(
    owner.mutation(api.pages.publish, {
      ...first,
      expectedRevision: 2,
      expectedPublishedRevision: 2,
    })
  ).rejects.toThrow("use rollback")
  await owner.mutation(api.pages.rollback, {
    ...first,
    expectedRevision: 2,
    expectedPublishedRevision: 2,
  })
  expect(
    (await owner.query(api.pages.get, { pageId: first.pageId })).version
      ?.definition.title
  ).toBe("First")
  const events = await owner.query(api.auditEvents.list, {
    workspaceId,
    paginationOpts: { numItems: 1, cursor: null },
  })
  expect(events.page.map(({ event }) => event)).toEqual([
    { operation: "page.rollback", pageId: first.pageId, revision: 1 },
  ])
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
  const htmlReport = (id: typeof artifactId) =>
    owner.mutation(api.pages.save, {
      workspaceId,
      definition: {
        title: "Report",
        blocks: [{ kind: "htmlReport", title: "Report", artifactId: id }],
      },
    })
  await expect(htmlReport(artifactId)).rejects.toThrow(
    "Artifact is unavailable"
  )
  const file = (contentType: string) =>
    t.run((ctx) =>
      ctx.db.insert("artifacts", {
        workspaceId,
        key: contentType,
        name: "report",
        size: 5,
        contentType,
        createdBy: { kind: "user", userId: "owner" },
      })
    )
  await expect(htmlReport(await file("text/plain"))).rejects.toThrow(
    "require an HTML file"
  )
  const html = await file("text/html; charset=utf-8")
  await expect(htmlReport(html)).rejects.toThrow("data timestamp")
  await owner.mutation(api.artifacts.setDataTimestamp, {
    artifactId: html,
    dataTimestamp: 1000,
  })
  expect((await htmlReport(html)).revision).toBe(1)
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
  await expect(
    owner.mutation(api.pages.save, {
      workspaceId,
      definition: {
        title: "Bad scatter",
        blocks: [
          {
            kind: "chart",
            title: "Bad scatter",
            binding: saved,
            chart: {
              type: "scatter",
              labelField: "amount",
              xField: "missing",
              xUnit: "",
              valueField: "amount",
              unit: "USD",
            },
          },
        ],
      },
    })
  ).rejects.toThrow("Chart requires")
  await owner.mutation(api.pages.save, {
    workspaceId,
    definition: {
      title: "Scatter",
      blocks: [
        {
          kind: "chart",
          title: "Scatter",
          binding: saved,
          chart: {
            type: "scatter",
            labelField: "amount",
            xField: "amount",
            xUnit: "",
            valueField: "amount",
            unit: "USD",
          },
        },
      ],
    },
  })
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
          {
            kind: "chart",
            title: "Bad",
            binding: saved,
            chart: {
              type: "line",
              labelField: "amount",
              valueField: "amount",
              unit: "USD",
            },
          },
        ],
      },
    })
  ).rejects.toThrow("Query is unavailable in this workspace")
  const published = await owner.query(api.pages.get, { pageId: page.pageId })
  const next = await owner.mutation(api.pages.save, {
    workspaceId,
    pageId: page.pageId,
    expectedRevision: 1,
    definition: published.version?.definition ?? { title: "", blocks: [] },
  })
  await t.run((ctx) =>
    ctx.db.patch(collectionId, { definition: { version: 2, fields: [] } })
  )
  const invalid = await owner.query(api.pages.get, { pageId: page.pageId })
  expect(invalid.bindings[0]).toContain("schema is stale")
  await expect(
    owner.mutation(api.pages.publish, {
      ...next,
      expectedRevision: 2,
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
      blocks: [
        { kind: "table", title: "Rows", binding, fields: ["amount"] },
        {
          kind: "chart",
          title: "Chart",
          binding,
          chart: {
            type: "bar",
            labelField: "amount",
            valueField: "amount",
            unit: "USD",
          },
        },
      ],
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
  const chart = await owner.query(api.pages.liveBlock, {
    ...address,
    blockIndex: 1,
  })
  expect(chart.result?.page).toEqual(live.result?.page)
  expect(chart.result?.completeness).toBe("partial")
  await expect(
    other.query(api.pages.liveBlock, { ...address, blockIndex: 1 })
  ).rejects.toThrow("Workspace access denied")
  expect(live.result?.page).toHaveLength(50)
  expect(live.result?.completeness).toBe("partial")
  expect(await owner.query(api.pages.sources, { workspaceId })).toHaveLength(1)
  await t.run((ctx) =>
    ctx.db.patch(collectionId, { definition: { version: 2, fields: [] } })
  )
  expect((await owner.query(api.pages.liveBlock, address)).problem).toContain(
    "schema is stale"
  )
  expect(
    (await owner.query(api.pages.liveBlock, { ...address, blockIndex: 1 }))
      .problem
  ).toContain("schema is stale")
  expect(await owner.query(api.pages.sources, { workspaceId })).toEqual([])
})

test("agent credentials draft, publish, get and list pages with clear binding errors", async () => {
  const { t, workspaceId, otherWorkspaceId } = await fixture()
  const { digestToken } = await import("./agentAccess")
  const writer = "a".repeat(64)
  const reader = "b".repeat(64)
  const { queryId, foreignPageId } = await t.run(async (ctx) => {
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
    const collection = {
      version: 1,
      fields: [
        {
          id: "amount",
          label: "Amount",
          type: "number" as const,
          indexed: true as const,
        },
      ],
    }
    const collectionId = await ctx.db.insert("collections", {
      workspaceId,
      name: "Numbers",
      definition: collection,
    })
    const queryId = await ctx.db.insert("queryDefinitions", {
      workspaceId,
      collectionId,
      name: "Amounts",
      revision: 1,
    })
    await ctx.db.insert("queryDefinitionVersions", {
      queryId,
      revision: 1,
      schemaVersion: 1,
      resultSchema: collection,
      query: { fieldId: "amount", order: "asc" },
    })
    const foreignPageId = await ctx.db.insert("pages", {
      workspaceId: otherWorkspaceId,
      title: "Theirs",
      revision: 1,
    })
    return { queryId, foreignPageId }
  })
  type Body =
    | typeof Pages.SaveDraftInput.Type
    | typeof Pages.PublishInput.Type
    | typeof Pages.GetInput.Type
    | typeof Pages.ListInput.Type
  const call = async (operation: string, body: Body, token = writer) => {
    const response = await t.fetch(`/agent/pages/${operation}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }
  const metric = {
    kind: "metric" as const,
    title: "Total",
    binding: { queryId, revision: 1 },
    field: "amount",
    unit: "USD",
    operation: "sum" as const,
  }
  const definition = { title: "Numbers", blocks: [metric] }

  expect(await call("saveDraft", { definition }, reader)).toMatchObject({
    status: 403,
  })
  expect(
    await call("saveDraft", {
      definition: {
        title: "Bad",
        blocks: [
          { kind: "markdown", text: "Intro" },
          { ...metric, binding: { queryId: "nope", revision: 1 } },
        ],
      },
    })
  ).toEqual({
    status: 400,
    body: {
      error:
        'Block 2 (metric): "nope" is not a saved query ID. Use queries_list to find one.',
    },
  })
  expect(
    await call("saveDraft", {
      definition: { title: "Bad", blocks: [{ ...metric, field: "missing" }] },
    })
  ).toEqual({
    status: 400,
    body: {
      error:
        'Block 1 (metric): Metric requires a numeric result field; "missing" is not one. Result fields: amount (number)',
    },
  })
  expect(
    await call("saveDraft", {
      definition: {
        ...definition,
        blocks: [{ ...metric, binding: { queryId, revision: 2 } }],
      },
    })
  ).toMatchObject({
    status: 400,
    body: {
      error:
        "Block 1 (metric): Query revision 2 is unavailable; the latest is 1",
    },
  })

  const draft = await call("saveDraft", { definition })
  expect(draft).toMatchObject({ status: 200, body: { revision: 1 } })
  const { pageId } = draft.body
  expect(
    await call("saveDraft", { pageId, expectedRevision: 2, definition })
  ).toMatchObject({ status: 409 })
  expect(await call("get", { pageId }, reader)).toMatchObject({
    status: 200,
    body: {
      page: { pageId, revision: 1, publishedRevision: null },
      version: null,
      bindings: [],
    },
  })
  expect(
    await call("publish", {
      pageId,
      revision: 1,
      expectedRevision: 1,
      expectedPublishedRevision: null,
    })
  ).toEqual({
    status: 200,
    body: { pageId, title: "Numbers", revision: 1, publishedRevision: 1 },
  })
  expect(
    await call("publish", {
      pageId,
      revision: 1,
      expectedRevision: 1,
      expectedPublishedRevision: null,
    })
  ).toMatchObject({ status: 409 })
  const events = await t
    .withIdentity({ tokenIdentifier: "owner" })
    .query(api.auditEvents.list, {
      workspaceId,
      paginationOpts: { numItems: 2, cursor: null },
    })
  expect(events.page.map(({ actor, event }) => [actor.kind, event])).toEqual([
    ["agent", { operation: "page.publish", pageId, revision: 1 }],
    ["agent", { operation: "page.save", pageId, revision: 1 }],
  ])
  expect(await call("get", { pageId }, reader)).toMatchObject({
    status: 200,
    body: { version: { revision: 1, definition }, bindings: [null] },
  })
  expect(await call("list", {}, reader)).toMatchObject({
    status: 200,
    body: { isDone: true, page: [{ pageId, publishedRevision: 1 }] },
  })
  expect(await call("get", { pageId: foreignPageId })).toMatchObject({
    status: 403,
  })
  const scatter = {
    title: "Scatter",
    blocks: [
      {
        kind: "chart" as const,
        title: "Amounts",
        binding: { queryId, revision: 1 },
        chart: {
          type: "scatter" as const,
          labelField: "amount",
          xField: "amount",
          xUnit: "",
          valueField: "amount",
          unit: "USD",
        },
      },
    ],
  }
  const scatterDraft = await call("saveDraft", { definition: scatter })
  expect(scatterDraft).toMatchObject({ status: 200 })
  expect(
    await call("get", { pageId: scatterDraft.body.pageId, revision: 1 }, reader)
  ).toMatchObject({ status: 200, body: { version: { definition: scatter } } })

  const reportId = await t.run((ctx) =>
    ctx.db.insert("artifacts", {
      workspaceId,
      key: "report",
      name: "report.html",
      size: 5,
      contentType: "text/html",
      dataTimestamp: 1000,
      createdBy: { kind: "user", userId: "owner" },
    })
  )
  const report = {
    title: "Report",
    blocks: [
      { kind: "htmlReport" as const, title: "Q3", artifactId: reportId },
    ],
  }
  const reportPage = await call("saveDraft", { definition: report })
  expect(reportPage).toMatchObject({ status: 200 })
  expect(
    await call("get", { pageId: reportPage.body.pageId, revision: 1 }, reader)
  ).toMatchObject({
    status: 200,
    body: { version: { definition: report } },
  })

  // A retried keyed write returns the first result and writes once.
  const keyed = { definition, idempotencyKey: "draft-1" }
  const first = await call("saveDraft", keyed)
  expect(first).toMatchObject({ status: 200, body: { revision: 1 } })
  expect(await call("saveDraft", keyed)).toEqual(first)
  expect(
    await call("saveDraft", { ...keyed, definition: report })
  ).toMatchObject({ status: 409 })
  const publishOnce = {
    pageId: first.body.pageId,
    revision: 1,
    expectedRevision: 1,
    expectedPublishedRevision: null,
    idempotencyKey: "publish-1",
  }
  const published = await call("publish", publishOnce)
  expect(published).toMatchObject({ status: 200 })
  expect(await call("publish", publishOnce)).toEqual(published)
  expect(await call("list", { limit: 20 }, reader)).toMatchObject({
    body: { page: { length: 4 } },
  })
}, 30_000)
