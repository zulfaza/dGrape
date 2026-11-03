/// <reference types="vite/client" />
import { convexTest } from "convex-test"
import { describe, expect, it, vi } from "vitest"
import schema from "./schema"
import { api, internal } from "./_generated/api"
import type { Recipe } from "./lib/recipeDomain"

const modules = import.meta.glob("./**/*.ts")
const recipe: Recipe = {
  steps: [{ kind: "artifact", name: "data.json", format: "json" }],
  limits: { rows: 100, bytes: 10000, durationMs: 60000, attempts: 2 },
}
async function setup() {
  const t = convexTest(schema, modules)
  const workspaceId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("workspaces", { name: "Recipes" })
    await ctx.db.insert("workspaceMembers", {
      workspaceId: id,
      userId: "test|owner",
      role: "owner",
    })
    return id
  })
  const owner = t.withIdentity({ tokenIdentifier: "test|owner" })
  const versionId = await owner.mutation(api.recipes.publish, {
    workspaceId,
    name: "Daily",
    recipe,
  })
  return { t, owner, workspaceId, versionId }
}
describe("recipe lifecycle", () => {
  it("pins immutable versions, deduplicates manual delivery and scopes paginated reads", async () => {
    const { t, owner, workspaceId, versionId } = await setup()
    const first = await owner.mutation(api.recipes.trigger, {
      versionId,
      idempotencyKey: "one",
    })
    expect(
      await owner.mutation(api.recipes.trigger, {
        versionId,
        idempotencyKey: "one",
      })
    ).toBe(first)
    await owner.mutation(api.recipes.trigger, {
      versionId,
      idempotencyKey: "two",
    })
    const page = await owner.query(api.recipes.runs, {
      workspaceId,
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(page.page).toHaveLength(1)
    const next = await owner.query(api.recipes.runs, {
      workspaceId,
      paginationOpts: { numItems: 1, cursor: page.continueCursor },
    })
    expect(next.page[0]._id).not.toBe(page.page[0]._id)
    await expect(
      t
        .withIdentity({ tokenIdentifier: "test|other" })
        .query(api.recipes.runs, {
          workspaceId,
          paginationOpts: { numItems: 10, cursor: null },
        })
    ).rejects.toThrow("access denied")
    await expect(
      t.mutation(api.recipes.trigger, { versionId, idempotencyKey: "bad" })
    ).rejects.toThrow("Unauthenticated")
    const second = await owner.mutation(api.recipes.publish, {
      workspaceId,
      name: "New",
      recipe,
    })
    await expect(
      owner.mutation(api.recipes.trigger, {
        versionId: second,
        idempotencyKey: "one",
      })
    ).rejects.toThrow("another recipe")
  })
  it("repairs a crash before Workflow creation by reclaiming an expired lease", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 10, 3))
    try {
      const { t, owner, versionId } = await setup()
      const runId = await owner.mutation(api.recipes.trigger, {
        versionId,
        idempotencyKey: "crash",
      })
      const first = await t.mutation(internal.recipes.dispatch, {})
      expect(first.map((run) => run._id)).toEqual([runId])
      expect(await t.mutation(internal.recipes.dispatch, {})).toEqual([])
      vi.advanceTimersByTime(120001)
      await expect(
        t.mutation(internal.recipes.begin, { runId, epoch: first[0].epoch })
      ).rejects.toThrow("stale")
      const retry = await t.mutation(internal.recipes.dispatch, {})
      await expect(
        t.mutation(internal.recipes.begin, { runId, epoch: first[0].epoch })
      ).rejects.toThrow("stale")
      expect(retry[0]._id).toBe(runId)
      expect(retry[0].epoch).toBe(first[0].epoch + 1)
      const begun = await t.mutation(internal.recipes.begin, {
        runId,
        epoch: retry[0].epoch,
      })
      expect(
        await t.mutation(internal.recipes.begin, {
          runId,
          epoch: retry[0].epoch,
        })
      ).toEqual(begun)
    } finally {
      vi.useRealTimers()
    }
  })
  it("skips overlaps and coalesces missed occurrences", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.UTC(2026, 10, 3))
    try {
      const { t, owner, versionId, workspaceId } = await setup()
      const scheduleId = await owner.mutation(api.recipes.schedule, {
        versionId,
        timing: { kind: "cron", expression: "* * * * *" },
      })
      vi.advanceTimersByTime(10 * 60000)
      await owner.mutation(api.recipes.setEnabled, {
        scheduleId,
        enabled: true,
      })
      const first = await t.mutation(internal.recipes.dispatch, {})
      expect(first).toHaveLength(1)
      expect(first[0].key).toContain(String(Date.UTC(2026, 10, 3, 0, 10)))
      expect(first[0].versionId).toBe(versionId)
      await t.mutation(internal.recipes.begin, {
        runId: first[0]._id,
        epoch: first[0].epoch,
      })
      vi.advanceTimersByTime(60000)
      expect(await t.mutation(internal.recipes.dispatch, {})).toEqual([])
      const all = await owner.query(api.recipes.runs, {
        workspaceId,
        paginationOpts: { numItems: 10, cursor: null },
      })
      expect(all.page.map((run) => run.state)).toEqual(["skipped", "running"])
      await owner.mutation(api.recipes.setEnabled, {
        scheduleId,
        enabled: false,
      })
    } finally {
      vi.useRealTimers()
    }
  })
  it("records bounded attempts, redacts failures and cancels between steps", async () => {
    const { t, owner, versionId } = await setup()
    const runId = await owner.mutation(api.recipes.trigger, {
      versionId,
      idempotencyKey: "retry",
    })
    const [claim] = await t.mutation(internal.recipes.dispatch, {})
    await t.mutation(internal.recipes.begin, { runId, epoch: claim.epoch })
    expect(
      await t.mutation(internal.recipes.startStep, {
        runId,
        epoch: claim.epoch,
        step: 0,
      })
    ).toEqual({ state: "started", attempt: 1 })
    await t.mutation(internal.recipes.failStep, {
      runId,
      epoch: claim.epoch,
      step: 0,
      attempt: 1,
    })
    expect(
      await t.mutation(internal.recipes.startStep, {
        runId,
        epoch: claim.epoch,
        step: 0,
      })
    ).toEqual({ state: "started", attempt: 2 })
    const history = await owner.query(api.recipes.history, {
      runId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(history.page[0].error).toBe("Step failed")
    await owner.mutation(api.recipes.cancel, { runId })
    expect(
      await t.mutation(internal.recipes.startStep, {
        runId,
        epoch: claim.epoch,
        step: 0,
      })
    ).toEqual({ state: "cancelled" })
    await expect(
      t.mutation(internal.recipes.startStep, {
        runId,
        epoch: claim.epoch - 1,
        step: 0,
      })
    ).rejects.toThrow("stale")
  })
  it("limits active Workflow claims across repeated dispatcher deliveries", async () => {
    const { t, owner, versionId } = await setup()
    for (let i = 0; i < 6; i++)
      await owner.mutation(api.recipes.trigger, {
        versionId,
        idempotencyKey: String(i),
      })
    expect(await t.mutation(internal.recipes.dispatch, {})).toHaveLength(4)
    expect(await t.mutation(internal.recipes.dispatch, {})).toHaveLength(0)
  })
})

describe("recipe credentials", () => {
  it("uses the credential owner, requires writes and keeps run grants separate from management", async () => {
    const { t, owner, workspaceId, versionId } = await setup()
    await t.run(async (ctx) => {
      await ctx.db.insert("workspaceMembers", {
        workspaceId,
        userId: "test|runner",
        role: "owner",
      })
      for (const [digest, user, scope] of [
        ["owner", "test|owner", "readwrite"],
        ["reader", "test|owner", "readonly"],
        ["runner", "test|runner", "readwrite"],
      ]) {
        if (scope !== "readonly" && scope !== "readwrite")
          throw new Error("Invalid scope")
        await ctx.db.insert("agentGrants", {
          workspaceId,
          owner: user,
          digest,
          scope,
          state: "active",
          expiresAt: Date.now() + 60000,
        })
      }
    })
    const runner = t.withIdentity({ tokenIdentifier: "test|runner" })
    expect(await owner.query(api.recipes.permissions, { versionId })).toEqual({
      canManage: true,
      canRun: true,
    })
    expect(await runner.query(api.recipes.permissions, { versionId })).toEqual({
      canManage: false,
      canRun: false,
    })
    await expect(
      t.query(api.recipes.permissions, { versionId })
    ).rejects.toThrow("Unauthenticated")
    await expect(
      t
        .withIdentity({ tokenIdentifier: "test|outsider" })
        .query(api.recipes.permissions, { versionId })
    ).rejects.toThrow("access denied")
    const input = { versionId, idempotencyKey: "credential" }
    for (const digest of ["missing", "reader", "runner"])
      await expect(
        t.mutation(internal.agentRecipes.trigger, { ...input, digest })
      ).rejects.toThrow("denied")
    await owner.mutation(api.recipes.setRunAccess, {
      versionId,
      userId: "test|runner",
      allowed: true,
    })
    expect(await runner.query(api.recipes.permissions, { versionId })).toEqual({
      canManage: false,
      canRun: true,
    })
    const runId = await t.mutation(internal.agentRecipes.trigger, {
      ...input,
      digest: "runner",
    })
    expect(
      await t.mutation(internal.agentRecipes.trigger, {
        ...input,
        digest: "runner",
      })
    ).toBe(runId)
    await expect(
      t.mutation(internal.agentRecipes.schedule, {
        digest: "runner",
        versionId,
        timing: { kind: "once", at: Date.now() + 60000 },
      })
    ).rejects.toThrow("denied")
    await expect(
      t.mutation(internal.agentRecipes.setRunAccess, {
        digest: "runner",
        versionId,
        userId: "test|owner",
        allowed: true,
      })
    ).rejects.toThrow("denied")
    const published = await t
      .withIdentity({ tokenIdentifier: "test|runner" })
      .mutation(internal.agentRecipes.publish, {
        digest: "owner",
        name: "Agent",
        recipe,
      })
    expect(
      await t.run(async (ctx) => (await ctx.db.get(published))?.createdBy)
    ).toBe("test|owner")
    const scheduleId = await t.mutation(internal.agentRecipes.schedule, {
      digest: "owner",
      versionId,
      timing: { kind: "once", at: Date.now() + 60000 },
    })
    await expect(
      t.mutation(internal.agentRecipes.setEnabled, {
        digest: "reader",
        scheduleId,
        enabled: false,
      })
    ).rejects.toThrow("denied")
    await t.mutation(internal.agentRecipes.setEnabled, {
      digest: "owner",
      scheduleId,
      enabled: false,
    })
    await t.mutation(internal.agentRecipes.cancel, { digest: "runner", runId })
    expect(await t.run(async (ctx) => (await ctx.db.get(runId))?.state)).toBe(
      "cancelled"
    )
    await t.mutation(internal.agentRecipes.setRunAccess, {
      digest: "owner",
      versionId,
      userId: "test|runner",
      allowed: false,
    })
    expect(await runner.query(api.recipes.permissions, { versionId })).toEqual({
      canManage: false,
      canRun: false,
    })
    await expect(
      t.mutation(internal.agentRecipes.trigger, { ...input, digest: "runner" })
    ).rejects.toThrow("denied")
  })

  it("scopes IDs and pages and checks HTTP credentials and bodies", async () => {
    const { t, owner, workspaceId, versionId } = await setup()
    const { digestToken } = await import("./agentAccess")
    const token = "a".repeat(64)
    const digest = await digestToken(token)
    await t.run(async (ctx) => {
      await ctx.db.insert("agentGrants", {
        workspaceId,
        owner: "test|owner",
        digest,
        scope: "readwrite",
        state: "active",
        expiresAt: Date.now() + 60000,
      })
    })
    const foreign = await t.run(async (ctx) => {
      const workspaceId = await ctx.db.insert("workspaces", { name: "Other" })
      return ctx.db.insert("recipeVersions", {
        workspaceId,
        name: "Other",
        recipe,
        createdBy: "test|owner",
      })
    })
    await expect(
      t.mutation(internal.agentRecipes.trigger, {
        digest,
        versionId: foreign,
        idempotencyKey: "foreign",
      })
    ).rejects.toThrow("denied")
    const foreignRun = await t.run(async (ctx) =>
      ctx.db.insert("recipeRuns", {
        workspaceId: (await ctx.db.get(foreign))?.workspaceId ?? workspaceId,
        versionId: foreign,
        key: "foreign",
        state: "pending",
        cancelRequested: false,
        leaseUntil: 0,
        epoch: 0,
        nextStep: 0,
      })
    )
    await expect(
      t.mutation(internal.agentRecipes.history, {
        digest,
        runId: foreignRun,
        paginationOpts: { numItems: 50, cursor: null },
      })
    ).rejects.toThrow("denied")
    await expect(
      t.mutation(internal.agentRecipes.cancel, { digest, runId: foreignRun })
    ).rejects.toThrow("denied")
    const foreignIds = await t.run(async (ctx) => {
      const version = await ctx.db.get(foreign)
      if (!version) throw new Error("Recipe missing")
      const collectionId = await ctx.db.insert("collections", {
        workspaceId: version.workspaceId,
        name: "Foreign",
        definition: {
          version: 1,
          fields: [{ id: "id", label: "ID", type: "text" }],
        },
      })
      const scheduleId = await ctx.db.insert("recipeSchedules", {
        workspaceId: version.workspaceId,
        versionId: foreign,
        timing: { kind: "once", at: Date.now() + 60000 },
        enabled: true,
        nextAt: Date.now() + 60000,
      })
      return { collectionId, scheduleId }
    })
    await expect(
      t.mutation(internal.agentRecipes.setEnabled, {
        digest,
        scheduleId: foreignIds.scheduleId,
        enabled: false,
      })
    ).rejects.toThrow("denied")
    await expect(
      t.mutation(internal.agentRecipes.publish, {
        digest,
        name: "Foreign output",
        recipe: {
          ...recipe,
          steps: [{ kind: "snapshot", collectionId: foreignIds.collectionId }],
        },
      })
    ).rejects.toThrow("denied")
    await expect(
      t.mutation(internal.agentRecipes.publish, {
        digest,
        name: "Invalid connection",
        recipe: {
          ...recipe,
          steps: [
            {
              kind: "fetch",
              connectionId: "missing",
              route: "/data",
              maxPages: 1,
            },
            ...recipe.steps,
          ],
        },
      })
    ).rejects.toThrow("denied")
    const first = await t.mutation(internal.agentRecipes.versions, {
      digest,
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(first.page.map((item) => item._id)).toEqual([versionId])
    await expect(
      t.mutation(internal.agentRecipes.versions, {
        digest,
        paginationOpts: { numItems: 51, cursor: null },
      })
    ).rejects.toThrow("Invalid page")
    const request = (operation: string, body: string, credential = token) =>
      t.fetch(`/agent/recipes/${operation}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
        },
        body,
      })
    expect(
      (
        await request(
          "trigger",
          JSON.stringify({ versionId, idempotencyKey: "http" }),
          "b".repeat(64)
        )
      ).status
    ).toBe(403)
    expect((await request("trigger", "{}")).status).toBe(400)
    expect((await request("publish", "x".repeat(256 * 1024 + 1))).status).toBe(
      413
    )
    const response = await request(
      "trigger",
      JSON.stringify({ versionId, idempotencyKey: "http" })
    )
    expect(response.status).toBe(200)
    const runs = await t.mutation(internal.agentRecipes.runs, {
      digest,
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(runs.page).toHaveLength(1)
    expect(
      (
        await t.mutation(internal.agentRecipes.history, {
          digest,
          runId: runs.page[0]._id,
          paginationOpts: { numItems: 50, cursor: null },
        })
      ).page
    ).toEqual([])
    expect(
      (
        await t.mutation(internal.agentRecipes.schedules, {
          digest,
          paginationOpts: { numItems: 50, cursor: null },
        })
      ).page
    ).toEqual([])
    await owner.mutation(api.recipes.trigger, {
      versionId,
      idempotencyKey: "other",
    })
    await t.run(async (ctx) => {
      const grant = await ctx.db
        .query("agentGrants")
        .withIndex("by_digest", (q) => q.eq("digest", digest))
        .unique()
      if (!grant) throw new Error("Grant missing")
      await ctx.db.patch(grant._id, { state: "revoked" })
    })
    expect(
      (
        await request(
          "runs",
          JSON.stringify({ paginationOpts: { numItems: 50, cursor: null } })
        )
      ).status
    ).toBe(403)
  })
})
