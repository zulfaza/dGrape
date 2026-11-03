/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { expect, test } from "vitest"
import schema from "./schema"
import { api } from "./_generated/api"
const modules = import.meta.glob("./**/*.ts")
test("snapshot time and preview enforce membership, format and past timestamp", async () => {
  const t = convexTest(schema, modules)
  const owner = t.withIdentity({ tokenIdentifier: "owner" })
  const stranger = t.withIdentity({ tokenIdentifier: "stranger" })
  const workspaceId = await owner.mutation(api.workspaces.create, {
    name: "Snapshot",
  })
  const artifactId = await t.run((ctx) =>
    ctx.db.insert("artifacts", {
      workspaceId,
      name: "Report",
      key: "private",
      contentType: "text/html",
      size: 10,
      createdBy: { kind: "user", userId: "owner" },
    })
  )
  await expect(
    t.action(api.artifacts.getPreview, { artifactId })
  ).rejects.toThrow("Unauthenticated")
  await expect(
    stranger.action(api.artifacts.getPreview, { artifactId })
  ).rejects.toThrow("access denied")
  await expect(
    stranger.mutation(api.artifacts.setDataTimestamp, {
      artifactId,
      dataTimestamp: 0,
    })
  ).rejects.toThrow("access denied")
  expect(
    await owner.action(api.artifacts.getPreview, { artifactId })
  ).toMatchObject({ status: "unavailable" })
  for (const dataTimestamp of [-1, 0.5, Date.now() + 100000]) {
    await expect(
      owner.mutation(api.artifacts.setDataTimestamp, {
        artifactId,
        dataTimestamp,
      })
    ).rejects.toThrow("valid past date")
  }
  await owner.mutation(api.artifacts.setDataTimestamp, {
    artifactId,
    dataTimestamp: 1000,
  })
  expect(await t.run((ctx) => ctx.db.get(artifactId))).toMatchObject({
    dataTimestamp: 1000,
  })
  await owner.mutation(api.artifacts.setDataTimestamp, {
    artifactId,
    dataTimestamp: null,
  })
  expect(await t.run((ctx) => ctx.db.get(artifactId))).not.toHaveProperty(
    "dataTimestamp"
  )
})
