import type { Doc } from "./_generated/dataModel"
import { v, type Infer } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import { runSavedQuery } from "./lib/savedQueries"

const args = { queryId: v.id("queryDefinitions"), expectedRevision: v.number() }

/** Rebuild a small report atomically. Larger reports fail without partial totals. */
export const rebuild = mutation({
  args,
  returns: v.null(),
  handler: async (ctx, args) => {
    const saved = await ctx.db.get(args.queryId)
    if (!saved) throw new Error("Query access denied")
    await requireMembership(ctx, saved.workspaceId)
    const collection = await ctx.db.get(saved.collectionId)
    if (!collection || collection.workspaceId !== saved.workspaceId)
      throw new Error("Collection access denied")
    let result: Doc<"reportCounts">["result"]
    try {
      const page = await runSavedQuery(ctx, {
        ...args,
        paginationOpts: {
          cursor: null,
          numItems: 50,
          maximumRowsRead: 100,
          maximumBytesRead: 1_000_000,
        },
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
    await requireMembership(ctx, saved.workspaceId)
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
