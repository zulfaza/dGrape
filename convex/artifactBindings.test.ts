/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { api } from "./_generated/api"
const modules = import.meta.glob("./**/*.ts")
test("file links authorize identity and workspace, retry safely, enforce MIME and cap, survive deletion", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const stranger = t.withIdentity({ tokenIdentifier: "stranger" })
  const workspaceId = await owner.mutation(api.workspaces.create, { name: "A" })
  const foreign = await owner.mutation(api.workspaces.create, { name: "B" })
  const recordId = await t.run(async (ctx) => {
    const collectionId = await ctx.db.insert("collections", {
      workspaceId,
      name: "Records",
      definition: { version: 1, fields: [] },
    })
    return ctx.db.insert("collectionRecords", {
      collectionId,
      schemaVersion: 1,
      revision: 1,
      values: {},
    })
  })
  async function file(contentType: string, workspace = workspaceId) {
    return t.run((ctx) =>
      ctx.db.insert("artifacts", {
        workspaceId: workspace,
        name: "test",
        key: crypto.randomUUID(),
        contentType,
        size: 10,
        createdBy: { kind: "user", userId: "owner" },
      })
    )
  }
  const artifactId = await file("text/plain")
  const args = { recordId, artifactId, relation: "attachment" }
  const first = await owner.mutation(api.artifactBindings.bind, {
    ...args,
    relation: "attachment",
  })
  expect(
    await owner.mutation(api.artifactBindings.bind, {
      ...args,
      relation: "attachment",
    })
  ).toBe(first)
  await expect(
    stranger.query(api.artifactBindings.list, { recordId })
  ).rejects.toThrow("access denied")
  await expect(
    stranger.mutation(api.artifactBindings.bind, {
      ...args,
      relation: "attachment",
    })
  ).rejects.toThrow("access denied")
  await expect(
    stranger.mutation(api.artifactBindings.unbind, {
      ...args,
      relation: "attachment",
    })
  ).rejects.toThrow("access denied")
  await expect(
    t.query(api.artifactBindings.list, { recordId })
  ).rejects.toThrow("Unauthenticated")
  const foreignFile = await file("text/plain", foreign)
  await expect(
    owner.mutation(api.artifactBindings.bind, {
      recordId,
      artifactId: foreignFile,
      relation: "attachment",
    })
  ).rejects.toThrow("unavailable")
  expect(
    await owner.query(api.artifacts.metadata, {
      workspaceId,
      artifactId: foreignFile,
    })
  ).toBeNull()
  for (const type of ["image/svg+xml", "application/octet-stream"]) {
    const id = await file(type)
    await expect(
      owner.mutation(api.artifactBindings.bind, {
        recordId,
        artifactId: id,
        relation: "image",
      })
    ).rejects.toThrow("File type")
    await expect(
      owner.mutation(api.artifactBindings.bind, {
        recordId,
        artifactId: id,
        relation: "report",
      })
    ).rejects.toThrow("File type")
  }
  const html = await file("text/html")
  await expect(
    owner.mutation(api.artifactBindings.bind, {
      recordId,
      artifactId: html,
      relation: "report",
    })
  ).rejects.toThrow("timestamp")
  await owner.mutation(api.artifacts.setDataTimestamp, {
    artifactId: html,
    dataTimestamp: 1000,
  })
  await owner.mutation(api.artifactBindings.bind, {
    recordId,
    artifactId: html,
    relation: "report",
  })
  await owner.mutation(api.artifactBindings.unbind, {
    recordId,
    artifactId: html,
    relation: "report",
  })
  const image = await file("image/png")
  await owner.mutation(api.artifactBindings.bind, {
    recordId,
    artifactId: image,
    relation: "image",
  })
  await owner.mutation(api.artifactBindings.bind, {
    ...args,
    relation: "report",
  })
  for (let i = 3; i < 20; i++)
    await owner.mutation(api.artifactBindings.bind, {
      recordId,
      artifactId: await file("text/plain"),
      relation: "attachment",
    })
  await expect(
    owner.mutation(api.artifactBindings.bind, {
      recordId,
      artifactId: await file("text/plain"),
      relation: "attachment",
    })
  ).rejects.toThrow("20")
  expect(
    await owner.mutation(api.artifactBindings.bind, {
      ...args,
      relation: "attachment",
    })
  ).toBe(first)
  await t.run((ctx) => ctx.db.delete(artifactId))
  expect(
    (await owner.query(api.artifactBindings.list, { recordId })).find(
      (row) => row.artifactId === artifactId
    )?.name
  ).toBeNull()
  expect(
    await owner.query(api.artifacts.metadata, { workspaceId, artifactId })
  ).toBeNull()
  await owner.mutation(api.artifactBindings.unbind, {
    ...args,
    relation: "attachment",
  })
  await owner.mutation(api.artifactBindings.unbind, {
    ...args,
    relation: "attachment",
  })
  expect(
    await owner.query(api.artifactBindings.list, { recordId })
  ).toHaveLength(19)
})

test("saved artifact pages retain definitions and report deleted references", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Pages",
  })
  const artifactId = await t.run((ctx) =>
    ctx.db.insert("artifacts", {
      workspaceId,
      key: "report",
      name: "Report",
      size: 10,
      contentType: "application/json",
      createdBy: { kind: "user", userId: "owner" },
    })
  )
  const page = await owner.mutation(api.pages.save, {
    workspaceId,
    definition: {
      title: "Report page",
      blocks: [{ kind: "artifact", title: "Report", artifactId }],
    },
  })
  expect(
    (await owner.query(api.pages.get, { ...page })).version?.definition
      .blocks[0]
  ).toEqual({ kind: "artifact", title: "Report", artifactId })
  await t.run((ctx) => ctx.db.delete(artifactId))
  expect((await owner.query(api.pages.get, { ...page })).bindings[0]).toContain(
    "unavailable"
  )
})
