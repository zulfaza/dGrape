/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test, vi } from "vitest"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { changeArtifactUsage, usageRow } from "./lib/artifactUsage"
import { r2 } from "./lib/r2"
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

test("the upload sweep removes expired uploads only and keeps artifacts and usage", async () => {
  const deleted = vi.spyOn(r2, "deleteObject").mockResolvedValue()
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Sweep",
  })
  const now = Date.now()
  const hour = 60 * 60 * 1000
  const createdBy: Doc<"artifactUploads">["createdBy"] = {
    kind: "user",
    userId: "owner",
  }
  const expiresAt = [now - 3 * hour, now - 2 * hour, now - 30 * 60 * 1000]
  await t.run(async (ctx) => {
    for (const [i, at] of expiresAt.entries())
      await ctx.db.insert("artifactUploads", {
        workspaceId,
        key: `upload-${i}`,
        name: "a.txt",
        createdBy,
        expiresAt: at,
      })
    const artifactId = await ctx.db.insert("artifacts", {
      workspaceId,
      key: "kept",
      name: "kept.txt",
      contentType: "text/plain",
      size: 10,
      createdBy,
    })
    const artifact = await ctx.db.get(artifactId)
    if (!artifact) throw new Error("Artifact missing")
    await changeArtifactUsage(ctx, artifact, 1)
  })
  const usage = () =>
    t.run(async (ctx) => (await usageRow(ctx, workspaceId))?.artifacts)
  const before = await usage()
  await t.mutation(internal.artifacts.sweepExpiredUploads)
  // A retry or an overlapping run finds nothing more to delete.
  await t.mutation(internal.artifacts.sweepExpiredUploads)
  await t.run(async (ctx) => {
    const uploads = await ctx.db.query("artifactUploads").take(10)
    // The upload inside the grace period stays.
    expect(uploads.map((u) => u.key)).toEqual(["upload-2"])
    expect(
      (await ctx.db.query("artifacts").take(10)).map((a) => a.key)
    ).toEqual(["kept"])
  })
  expect(await usage()).toEqual(before)
  expect(deleted.mock.calls.map(([, key]) => key)).toEqual([
    "upload-0",
    "upload-1",
  ])
  // One run deletes at most 100 uploads and schedules the next page.
  await t.run(async (ctx) => {
    for (let i = 0; i < 150; i++)
      await ctx.db.insert("artifactUploads", {
        workspaceId,
        key: `old-${i}`,
        name: "a.txt",
        createdBy,
        expiresAt: now - 2 * hour,
      })
  })
  deleted.mockClear()
  await t.mutation(internal.artifacts.sweepExpiredUploads)
  expect(deleted).toHaveBeenCalledTimes(100)
  await t.mutation(internal.artifacts.sweepExpiredUploads)
  expect(deleted).toHaveBeenCalledTimes(150)
  deleted.mockRestore()
})
