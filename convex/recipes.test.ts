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
