import type { PaginationOptions, PaginationResult } from "convex/server"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { requireMembership } from "./auth"
import { checkQuery, queryRecords, type RecordQuery } from "./recordQuery"

/** Public contract: an immutable revision pins the source and result schema. */
export async function saveQuery(
  ctx: MutationCtx,
  args: {
    collectionId: Id<"collections">
    name: string
    query: RecordQuery
    queryId?: Id<"queryDefinitions">
    expectedRevision?: number
  }
): Promise<{ queryId: Id<"queryDefinitions">; revision: number }> {
  const collection = await ctx.db.get(args.collectionId)
  if (!collection) throw new Error("Collection access denied")
  await requireMembership(ctx, collection.workspaceId)
  const checked = checkQuery(collection.definition.fields, args.query)
  if (!checked.ok) throw new Error(checked.message)
  const name = args.name.trim()
  if (!name || name.length > 100)
    throw new Error("Query name must be 1 to 100 characters")
  let queryId: Id<"queryDefinitions">
  let revision: number
  if (args.queryId) {
    const saved = await ctx.db.get(args.queryId)
    if (
      !saved ||
      saved.collectionId !== collection._id ||
      saved.workspaceId !== collection.workspaceId
    )
      throw new Error("Query access denied")
    if (saved.revision !== args.expectedRevision)
      throw new Error("Query revision conflict")
    queryId = saved._id
    revision = saved.revision + 1
    await ctx.db.patch(queryId, { revision, name })
  } else {
    if (args.expectedRevision !== undefined)
      throw new Error("New queries have no expected revision")
    revision = 1
    queryId = await ctx.db.insert("queryDefinitions", {
      workspaceId: collection.workspaceId,
      collectionId: collection._id,
      name,
      revision,
    })
  }
  await ctx.db.insert("queryDefinitionVersions", {
    queryId,
    revision,
    schemaVersion: collection.definition.version,
    resultSchema: collection.definition,
    query: checked.value,
  })
  return { queryId, revision }
}

export type SavedQueryPage = PaginationResult<Doc<"collectionRecords">> & {
  queryId: Id<"queryDefinitions">
  revision: number
  resultSchema: Doc<"collections">["definition"]
  completeness: "complete" | "partial"
  freshness: "live"
  readAt: number
}

/** Membership is checked here so pages and the dashboard share one boundary. */
export async function runSavedQuery(
  ctx: QueryCtx,
  args: {
    queryId: Id<"queryDefinitions">
    expectedRevision: number
    paginationOpts: PaginationOptions
  }
): Promise<SavedQueryPage> {
  const saved = await ctx.db.get(args.queryId)
  if (!saved) throw new Error("Query access denied")
  await requireMembership(ctx, saved.workspaceId)
  const version = await ctx.db
    .query("queryDefinitionVersions")
    .withIndex("by_queryId_and_revision", (q) =>
      q.eq("queryId", saved._id).eq("revision", args.expectedRevision)
    )
    .unique()
  if (!version) throw new Error("Query revision mismatch")
  const collection = await ctx.db.get(saved.collectionId)
  if (!collection || collection.workspaceId !== saved.workspaceId)
    throw new Error("Collection access denied")
  if (version.schemaVersion !== collection.definition.version)
    throw new Error("Query schema mismatch; save a new revision")
  const opts = args.paginationOpts
  if (
    !Number.isSafeInteger(opts.numItems) ||
    opts.numItems < 1 ||
    opts.numItems > 50 ||
    opts.maximumRowsRead === undefined ||
    !Number.isSafeInteger(opts.maximumRowsRead) ||
    opts.maximumRowsRead < 1 ||
    opts.maximumRowsRead > 100 ||
    opts.maximumBytesRead === undefined ||
    !Number.isSafeInteger(opts.maximumBytesRead) ||
    opts.maximumBytesRead < 1 ||
    opts.maximumBytesRead > 1_000_000
  )
    throw new Error(
      "Query budget required: 1–50 results, at most 100 rows and 1000000 index bytes"
    )
  const result = await queryRecords(ctx, collection, version.query, opts)
  if (!result.ok) throw new Error(result.message)
  const resultBytes = new TextEncoder().encode(
    JSON.stringify(result.value.page)
  ).length
  if (resultBytes > opts.maximumBytesRead)
    throw new Error("Query result byte budget exceeded; reduce page size")
  return {
    queryId: saved._id,
    revision: version.revision,
    resultSchema: version.resultSchema,
    ...result.value,
    completeness:
      result.value.isDone && result.value.pageStatus !== "SplitRequired"
        ? "complete"
        : "partial",
    freshness: "live",
    readAt: Date.now(),
  }
}
