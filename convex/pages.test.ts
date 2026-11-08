/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { api } from "./_generated/api"
import { Schema } from "effect"
import * as Exports from "./lib/agentExportTransport"
import * as Pages from "./lib/agentPageTransport"
import type { PageBlock } from "./lib/pageDomain"
import type { Id } from "./_generated/dataModel"
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

test("page layouts stay inside the 12-column grid and never overlap", async () => {
  const { owner, workspaceId } = await fixture()
  const save = (
    ...layouts: ({ x: number; y: number; w: number; h: number } | undefined)[]
  ) =>
    owner.mutation(api.pages.save, {
      workspaceId,
      definition: {
        title: "Grid",
        blocks: layouts.map((layout): PageBlock => ({
          kind: "markdown",
          text: "",
          layout,
        })),
      },
    })
  await save({ x: 0, y: 0, w: 6, h: 4 }, { x: 6, y: 0, w: 6, h: 4 }, undefined)
  await expect(save({ x: 7, y: 0, w: 6, h: 4 })).rejects.toThrow("x + w <= 12")
  await expect(save({ x: 0, y: 0, w: 1.5, h: 4 })).rejects.toThrow("integers")
  await expect(save({ x: 0, y: 0, w: 4, h: 41 })).rejects.toThrow(
    "1 <= h <= 40"
  )
  await expect(
    save({ x: 0, y: 0, w: 6, h: 4 }, { x: 5, y: 3, w: 2, h: 2 })
  ).rejects.toThrow("Block 2 (markdown): layout overlaps Block 1")
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
  const totals = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Totals",
    query: {
      fieldId: "amount",
      order: "asc",
      aggregate: {
        measures: [{ op: "count" }, { op: "sum", fieldId: "amount" }],
      },
    },
  })
  const page = await owner.mutation(api.pages.save, {
    workspaceId,
    definition: {
      title: "Live",
      blocks: [
        { kind: "table", title: "Rows", binding, fields: ["amount"] },
        {
          kind: "metric",
          title: "Count",
          binding: totals,
          field: "count",
          unit: "rows",
          operation: "sum",
        },
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
  const rowsOf = async (blockIndex: number) => {
    const { result } = await owner.query(api.pages.liveBlock, {
      ...address,
      blockIndex,
    })
    return result?.kind === "records" ? result.page : result?.rows
  }
  expect(await rowsOf(0)).toEqual([])
  expect(await rowsOf(1)).toEqual([
    { key: "null", values: { count: 0, sum_amount: 0 } },
  ])
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
    blockIndex: 2,
  })
  expect(await rowsOf(2)).toEqual(await rowsOf(0))
  expect(chart.result?.completeness).toBe("partial")
  await expect(
    other.query(api.pages.liveBlock, { ...address, blockIndex: 2 })
  ).rejects.toThrow("Workspace access denied")
  expect(await rowsOf(0)).toHaveLength(50)
  expect(live.result?.completeness).toBe("partial")
  expect(await rowsOf(1)).toEqual([
    { key: "null", values: { count: 60, sum_amount: 1770 } },
  ])
  expect(await owner.query(api.pages.sources, { workspaceId })).toHaveLength(2)
  await t.run((ctx) =>
    ctx.db.patch(collectionId, { definition: { version: 2, fields: [] } })
  )
  expect((await owner.query(api.pages.liveBlock, address)).problem).toContain(
    "schema is stale"
  )
  expect(
    (await owner.query(api.pages.liveBlock, { ...address, blockIndex: 2 }))
      .problem
  ).toContain("schema is stale")
  expect(await owner.query(api.pages.sources, { workspaceId })).toEqual([])
})

test("agent credentials draft, publish, get and list pages with clear binding errors", async () => {
  const { t, workspaceId, otherWorkspaceId } = await fixture()
  const { digestToken } = await import("./agentAccess")
  const writer = "a".repeat(64)
  const reader = "b".repeat(64)
  const pagesOnly = "e".repeat(64)
  const { queryId, foreignPageId, liveReportId } = await t.run(async (ctx) => {
    for (const [token, scope] of [
      [writer, "readwrite"],
      [reader, "readonly"],
      [pagesOnly, "pagesOnly"],
    ] as const)
      await ctx.db.insert("agentGrants", {
        workspaceId,
        owner: "owner",
        digest: await digestToken(token),
        scope: scope === "pagesOnly" ? ["pages.write"] : scope,
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
    const liveReportId = await ctx.db.insert("artifacts", {
      workspaceId,
      key: "live",
      name: "live.html",
      size: 5,
      contentType: "text/html",
      createdBy: { kind: "user", userId: "owner" },
    })
    return { queryId, foreignPageId, liveReportId }
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

  const liveReport = (bindingQueryId: string) => ({
    title: "Live",
    blocks: [
      {
        kind: "htmlReport" as const,
        title: "Live",
        artifactId: liveReportId,
        live: {
          bindings: [{ name: "amounts", queryId: bindingQueryId, revision: 1 }],
        },
      },
    ],
  })
  // A live report can send what it reads out of its frame, so saving one
  // needs data.read as well as pages.write.
  expect(
    await call("saveDraft", { definition: liveReport(queryId) }, pagesOnly)
  ).toMatchObject({
    status: 403,
    body: { error: expect.stringContaining("data.read") },
  })
  expect(await call("saveDraft", { definition: liveReport("nope") })).toEqual({
    status: 400,
    body: {
      error:
        'Block 1 (htmlReport): "nope" is not a saved query ID. Use queries_list to find one.',
    },
  })
  const live = await call("saveDraft", { definition: liveReport(queryId) })
  expect(live.status).toBe(200)
  expect(
    (await call("get", { pageId: live.body.pageId, revision: 1 })).body.version
      .definition
  ).toEqual(liveReport(queryId))
}, 30_000)

test("workspace exports keep every definition version and stable IDs, without user IDs, and need each read scope", async () => {
  const { t, owner, other, workspaceId } = await fixture()
  const collectionId = await owner.mutation(api.workspaces.createCollection, {
    workspaceId,
    name: "Numbers",
    fields: [{ id: "amount", label: "Amount", type: "number", indexed: true }],
  })
  await owner.mutation(api.workspaces.addField, {
    collectionId,
    field: { id: "note", label: "Note", type: "text" },
  })
  const first = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Amounts",
    query: { fieldId: "amount", order: "asc" },
  })
  await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Amounts",
    queryId: first.queryId,
    expectedRevision: 1,
    query: { fieldId: "amount", order: "desc" },
  })
  const page = await owner.mutation(api.pages.save, {
    workspaceId,
    definition: {
      title: "Numbers",
      blocks: [{ kind: "markdown", text: "One" }],
    },
  })
  await owner.mutation(api.pages.save, {
    workspaceId,
    pageId: page.pageId,
    expectedRevision: 1,
    definition: {
      title: "Numbers",
      blocks: [
        {
          kind: "table",
          title: "Rows",
          binding: first,
          fields: ["amount"],
        },
      ],
    },
  })
  await owner.mutation(api.pages.publish, {
    ...page,
    expectedRevision: 2,
    expectedPublishedRevision: null,
  })
  const { digestToken } = await import("./agentAccess")
  const reader = "c".repeat(64)
  const narrow = "d".repeat(64)
  const recipe = {
    steps: [
      // Stored join rows can hold string arrays; the MCP schema keeps them.
      {
        kind: "join" as const,
        field: "a",
        rightField: "b",
        prefix: "p",
        rows: [{ b: "x", tags: ["one"] }],
      },
      { kind: "snapshot" as const, collectionId },
    ],
    limits: { rows: 10, bytes: 1000, durationMs: 1000, attempts: 1 },
  }
  const { versionId, scheduleId } = await t.run(async (ctx) => {
    const grant = { workspaceId, owner: "owner", state: "active" as const }
    await ctx.db.insert("agentGrants", {
      ...grant,
      digest: await digestToken(reader),
      scope: "readonly",
      expiresAt: Date.now() + 60000,
    })
    await ctx.db.insert("agentGrants", {
      ...grant,
      digest: await digestToken(narrow),
      scope: ["data.read", "pages.read"],
      expiresAt: Date.now() + 60000,
    })
    await ctx.db.insert("secretRefs", {
      workspaceId,
      createdBy: "owner",
      owner: { kind: "workspace" },
      label: "SECRET_LABEL",
      revision: 1,
      state: { kind: "ready", name: "SECRET_NAME", objectId: "SECRET_OBJECT" },
    })
    const versionId = await ctx.db.insert("recipeVersions", {
      workspaceId,
      name: "Snapshot",
      recipe,
      createdBy: "owner",
    })
    const scheduleId = await ctx.db.insert("recipeSchedules", {
      workspaceId,
      versionId,
      timing: { kind: "cron", expression: "0 * * * *" },
      enabled: true,
      nextAt: 5,
    })
    return { versionId, scheduleId }
  })

  const result = await owner.query(api.workspaceExport.definitions, {
    workspaceId,
    now: 0,
  })
  if (result.kind !== "ok") throw new Error(result.kind)
  const exported = result.document
  expect(exported).toMatchObject({
    format: "dfe.workspace-definitions",
    formatVersion: 1,
    exportedAt: "1970-01-01T00:00:00.000Z",
    workspace: { id: workspaceId, name: "Pages" },
    collections: [
      {
        id: collectionId,
        name: "Numbers",
        definition: { version: 2 },
        history: [{ version: 1 }, { version: 2 }],
      },
    ],
    savedQueries: [
      {
        id: first.queryId,
        collectionId,
        revision: 2,
        revisions: [
          { revision: 1, query: { order: "asc" } },
          { revision: 2, query: { order: "desc" } },
        ],
      },
    ],
    recipes: {
      versions: [{ id: versionId, name: "Snapshot", recipe }],
      schedules: [
        {
          id: scheduleId,
          versionId,
          timing: { kind: "cron", expression: "0 * * * *" },
          enabled: true,
          revision: 0,
        },
      ],
    },
    pages: [
      {
        id: page.pageId,
        revision: 2,
        publishedRevision: 1,
        versions: [
          { revision: 1 },
          { revision: 2, definition: { blocks: [{ binding: first }] } },
        ],
      },
    ],
  })
  const text = JSON.stringify(exported)
  for (const absent of [
    "owner",
    "createdBy",
    "SECRET_LABEL",
    "SECRET_NAME",
    "SECRET_OBJECT",
    "nextAt",
  ])
    expect(text).not.toContain(absent)

  await expect(
    other.query(api.workspaceExport.definitions, { workspaceId, now: 0 })
  ).rejects.toThrow("access denied")

  const call = async (token: string) => {
    const response = await t.fetch("/agent/workspace/export", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    })
    return { status: response.status, body: await response.json() }
  }
  const agent = await call(reader)
  expect(agent.status).toBe(200)
  expect({ ...agent.body, exportedAt: exported.exportedAt }).toEqual(exported)
  // The MCP tool decodes the same body without loss.
  expect(Schema.decodeUnknownSync(Exports.WorkspaceExport)(agent.body)).toEqual(
    agent.body
  )
  expect(await call(narrow)).toEqual({
    status: 403,
    body: { error: expect.stringContaining("jobs.read") },
  })
}, 30_000)

test("live HTML reports read only declared bindings, with membership and revision checks", async () => {
  const { t, owner, other, workspaceId, otherWorkspaceId } = await fixture()
  const viewer = t.withIdentity({ tokenIdentifier: "viewer" })
  const fields = [
    {
      id: "amount",
      label: "Amount",
      type: "number" as const,
      indexed: true as const,
    },
    { id: "token", label: "Token", type: "secretRef" as const },
  ]
  const { collectionId, artifactId, staticId, foreignQueryId } = await t.run(
    async (ctx) => {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: "viewer",
        role: "viewer",
      })
      const collectionId = await ctx.db.insert("collections", {
        workspaceId,
        name: "Numbers",
        definition: { version: 1, fields },
      })
      const recordId = await ctx.db.insert("collectionRecords", {
        collectionId,
        schemaVersion: 1,
        revision: 1,
        values: { amount: 7, token: "SECRET_REF_ID" },
      })
      await ctx.db.insert("recordIndexEntries", {
        collectionId,
        recordId,
        fieldId: "amount",
        value: 7,
      })
      const foreignCollectionId = await ctx.db.insert("collections", {
        workspaceId: otherWorkspaceId,
        name: "Foreign",
        definition: { version: 1, fields },
      })
      const foreignQueryId = await ctx.db.insert("queryDefinitions", {
        workspaceId: otherWorkspaceId,
        collectionId: foreignCollectionId,
        name: "Foreign",
        revision: 1,
      })
      // No report data timestamp: a live report reads data at view time.
      const artifactId = await ctx.db.insert("artifacts", {
        workspaceId,
        key: "live",
        name: "live.html",
        size: 5,
        contentType: "text/html",
        createdBy: { kind: "user", userId: "owner" },
      })
      const staticId = await ctx.db.insert("artifacts", {
        workspaceId,
        key: "static",
        name: "static.html",
        size: 5,
        contentType: "text/html",
        createdBy: { kind: "user", userId: "owner" },
        dataTimestamp: 1000,
      })
      return { collectionId, artifactId, staticId, foreignQueryId }
    }
  )
  const saved = await owner.mutation(api.savedQueries.save, {
    collectionId,
    name: "Amounts",
    query: { fieldId: "amount", order: "asc" },
  })
  const report = (
    bindings: { name: string; queryId: typeof foreignQueryId }[]
  ) =>
    ({
      kind: "htmlReport",
      title: "Live",
      artifactId,
      live: {
        bindings: bindings.map((b) => ({ ...b, revision: saved.revision })),
      },
    }) satisfies PageBlock
  const save = (blocks: PageBlock[], pageId?: Id<"pages">) =>
    owner.mutation(api.pages.save, {
      workspaceId,
      pageId,
      expectedRevision: pageId ? 1 : undefined,
      definition: { title: "Live", blocks },
    })
  await expect(
    save([report([{ name: "Bad-Name", queryId: saved.queryId }])])
  ).rejects.toThrow("must match")
  await expect(
    save([
      report([
        { name: "amounts", queryId: saved.queryId },
        { name: "amounts", queryId: saved.queryId },
      ]),
    ])
  ).rejects.toThrow("unique")
  await expect(
    save([report([{ name: "foreign", queryId: foreignQueryId }])])
  ).rejects.toThrow('Binding "foreign": Query is unavailable')
  const page = await save([
    report([{ name: "amounts", queryId: saved.queryId }]),
    { kind: "htmlReport", title: "Static", artifactId: staticId },
  ])
  await owner.mutation(api.pages.publish, {
    ...page,
    expectedRevision: 1,
    expectedPublishedRevision: null,
  })
  const read = { pageId: page.pageId, revision: 1, blockIndex: 0 }
  const amounts = await viewer.query(api.pages.bridgeQuery, {
    ...read,
    name: "amounts",
  })
  // Secret reference fields and record metadata never reach the frame.
  expect(amounts).toEqual({
    problem: null,
    result: {
      kind: "records",
      fields: [{ id: "amount", label: "Amount", type: "number" }],
      rows: [{ amount: 7 }],
      completeness: "complete",
      evaluatedAt: expect.any(Number),
      dataAsOf: null,
    },
  })
  expect(JSON.stringify(amounts)).not.toContain("SECRET_REF_ID")
  expect(
    (await owner.query(api.pages.bridgeQuery, { ...read, name: "other" }))
      .problem
  ).toContain('no binding "other"')
  expect(
    (
      await owner.query(api.pages.bridgeQuery, {
        ...read,
        blockIndex: 1,
        name: "amounts",
      })
    ).problem
  ).toBe("Live report is unavailable")
  await expect(
    other.query(api.pages.bridgeQuery, { ...read, name: "amounts" })
  ).rejects.toThrow("Workspace access denied")

  // A viewer reads only the revision that viewers see; a writer can preview.
  await save(
    [report([{ name: "amounts", queryId: saved.queryId }])],
    page.pageId
  )
  const draft = { ...read, revision: 2, name: "amounts" }
  await expect(viewer.query(api.pages.bridgeQuery, draft)).rejects.toThrow(
    "not visible to your role"
  )
  expect((await owner.query(api.pages.bridgeQuery, draft)).problem).toBeNull()
})
