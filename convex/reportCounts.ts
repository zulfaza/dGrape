import type { Doc } from "./_generated/dataModel"
import { v, type Infer } from "convex/values"
import { internal } from "./_generated/api"
import { queryRecords } from "./lib/recordQuery"
import { internalMutation, mutation, query } from "./_generated/server"
import { memberWithAccess, requireMembership } from "./lib/auth"
import { workspaceBudgets } from "./lib/budgets"
import { firstPageWithinBudget, runSavedQuery } from "./lib/savedQueries"

const args = { queryId: v.id("queryDefinitions"), expectedRevision: v.number() }

/** Rebuild a small report atomically. Larger reports fail without partial totals. */
export const rebuild = mutation({
  args,
  returns: v.null(),
  handler: async (ctx, args) => {
    const saved = await ctx.db.get(args.queryId)
    if (!saved) throw new Error("Query access denied")
    await requireMembership(ctx, saved.workspaceId, "write")
    const collection = await ctx.db.get(saved.collectionId)
    if (!collection || collection.workspaceId !== saved.workspaceId)
      throw new Error("Collection access denied")
    let result: Doc<"reportCounts">["result"]
    try {
      const page = await runSavedQuery(ctx, {
        ...args,
        paginationOpts: firstPageWithinBudget(
          await workspaceBudgets(ctx, saved.workspaceId)
        ),
      })
      result =
        page.completeness === "complete"
          ? { kind: "complete", count: page.page.length }
          : {
              kind: "failed",
              message: "Report exceeds the bounded rebuild budget",
            }
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "Query result byte budget exceeded; reduce page size"
      )
        throw error
      result = {
        kind: "failed",
        message: "Report exceeds the result byte budget",
      }
    }
    const previous = await ctx.db
      .query("reportCounts")
      .withIndex("by_queryId_and_revision", (q) =>
        q.eq("queryId", args.queryId).eq("revision", args.expectedRevision)
      )
      .unique()
    const fields = {
      queryId: args.queryId,
      revision: args.expectedRevision,
      sourceRevision: collection.dataRevision ?? 0,
      builtAt: Date.now(),
      result,
    }
    if (previous) await ctx.db.replace(previous._id, fields)
    else await ctx.db.insert("reportCounts", fields)
    return null
  },
})

const reportState = v.union(
  v.object({ state: v.literal("pending") }),
  v.object({ state: v.literal("building"), processed: v.number() }),
  v.object({ state: v.literal("stale"), builtAt: v.number() }),
  v.object({
    state: v.literal("failed"),
    message: v.string(),
    builtAt: v.number(),
  }),
  v.object({
    state: v.literal("complete"),
    count: v.number(),
    builtAt: v.number(),
  })
)

export const read = query({
  args,
  returns: reportState,
  handler: async (ctx, args): Promise<Infer<typeof reportState>> => {
    const saved = await ctx.db.get(args.queryId)
    if (!saved) throw new Error("Query access denied")
    await requireMembership(ctx, saved.workspaceId, "read")
    const collection = await ctx.db.get(saved.collectionId)
    if (!collection || collection.workspaceId !== saved.workspaceId)
      throw new Error("Collection access denied")
    const version = await ctx.db
      .query("queryDefinitionVersions")
      .withIndex("by_queryId_and_revision", (q) =>
        q.eq("queryId", args.queryId).eq("revision", args.expectedRevision)
      )
      .unique()
    if (!version) throw new Error("Query revision mismatch")
    const report = await ctx.db
      .query("reportCounts")
      .withIndex("by_queryId_and_revision", (q) =>
        q.eq("queryId", args.queryId).eq("revision", args.expectedRevision)
      )
      .unique()
    if (!report) return { state: "pending" }
    if (
      report.sourceRevision !== (collection.dataRevision ?? 0) ||
      version.schemaVersion !== collection.definition.version
    )
      return { state: "stale", builtAt: report.builtAt }
    if (report.result.kind === "building")
      return { state: "building", processed: report.result.count }
    if (report.result.kind === "failed")
      return {
        state: "failed",
        message: report.result.message,
        builtAt: report.builtAt,
      }
    return {
      state: "complete",
      count: report.result.count,
      builtAt: report.builtAt,
    }
  },
})

/** Restartable bounded rebuild; never publish pages from different source revisions. */
export const start = mutation({
  args,
  returns: v.null(),
  handler: async (ctx, args) => {
    const saved = await ctx.db.get(args.queryId)
    if (!saved) throw new Error("Query access denied")
    const member = await requireMembership(ctx, saved.workspaceId, "write")
    const collection = await ctx.db.get(saved.collectionId)
    if (!collection || collection.workspaceId !== saved.workspaceId)
      throw new Error("Collection access denied")
    const version = await ctx.db
      .query("queryDefinitionVersions")
      .withIndex("by_queryId_and_revision", (q) =>
        q.eq("queryId", args.queryId).eq("revision", args.expectedRevision)
      )
      .unique()
    if (!version) throw new Error("Query revision mismatch")
    if (version.schemaVersion !== collection.definition.version)
      throw new Error("Query schema mismatch; save a new revision")
    const previous = await ctx.db
      .query("reportCounts")
      .withIndex("by_queryId_and_revision", (q) =>
        q.eq("queryId", args.queryId).eq("revision", args.expectedRevision)
      )
      .unique()
    if (
      previous?.result.kind === "building" &&
      previous.sourceRevision === (collection.dataRevision ?? 0)
    )
      return null
    const fields = {
      queryId: args.queryId,
      revision: args.expectedRevision,
      sourceRevision: collection.dataRevision ?? 0,
      builtAt: Date.now(),
      result: {
        kind: "building",
        count: 0,
        pages: 0,
        cursor: null,
        schemaVersion: collection.definition.version,
        requestedBy: member.userId,
      },
    } satisfies Omit<Doc<"reportCounts">, "_id" | "_creationTime">
    const reportId = previous
      ? previous._id
      : await ctx.db.insert("reportCounts", fields)
    if (previous) await ctx.db.replace(reportId, fields)
    await ctx.scheduler.runAfter(0, internal.reportCounts.step, {
      reportId,
      generation: fields.builtAt,
      page: 0,
    })
    return null
  },
})

export const step = internalMutation({
  args: {
    reportId: v.id("reportCounts"),
    generation: v.number(),
    page: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId)
    if (
      !report ||
      report.builtAt !== args.generation ||
      report.result.kind !== "building" ||
      report.result.pages !== args.page
    )
      return null
    const building = report.result
    const fail = async (message: string) => {
      await ctx.db.patch(report._id, { result: { kind: "failed", message } })
      return null
    }
    const saved = await ctx.db.get(report.queryId)
    if (!saved) return fail("Query no longer exists")
    const member = await memberWithAccess(
      ctx,
      saved.workspaceId,
      building.requestedBy,
      "write"
    )
    if (!member) return fail("Workspace access revoked")
    const collection = await ctx.db.get(saved.collectionId)
    if (!collection || collection.workspaceId !== saved.workspaceId)
      return fail("Collection no longer exists")
    if (
      (collection.dataRevision ?? 0) !== report.sourceRevision ||
      collection.definition.version !== building.schemaVersion
    )
      return fail("Source changed; restart rebuild")
    const version = await ctx.db
      .query("queryDefinitionVersions")
      .withIndex("by_queryId_and_revision", (q) =>
        q.eq("queryId", report.queryId).eq("revision", report.revision)
      )
      .unique()
    if (!version) return fail("Query revision no longer exists")
    const budgets = await workspaceBudgets(ctx, saved.workspaceId)
    const result = await queryRecords(ctx, collection, version.query, {
      cursor: building.cursor,
      numItems: 50,
      maximumRowsRead: budgets.queryRowsRead,
      maximumBytesRead: budgets.queryBytesRead,
    })
    if (!result.ok) return fail(result.message)
    const batch = result.value
    if (
      new TextEncoder().encode(JSON.stringify(batch.page)).length >
      budgets.queryBytesRead
    )
      return fail("Report exceeds the result byte budget")
    const count = building.count + batch.page.length
    if (batch.isDone && batch.pageStatus !== "SplitRequired") {
      await ctx.db.patch(report._id, {
        result: { kind: "complete", count },
        builtAt: Date.now(),
      })
      return null
    }
    if (building.pages >= 999)
      return fail("Report exceeds the background rebuild budget")
    await ctx.db.patch(report._id, {
      result: {
        ...building,
        count,
        cursor: batch.continueCursor,
        pages: building.pages + 1,
      },
    })
    await ctx.scheduler.runAfter(0, internal.reportCounts.step, {
      ...args,
      page: building.pages + 1,
    })
    return null
  },
})
