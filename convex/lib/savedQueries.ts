import type { PaginationOptions, PaginationResult } from "convex/server"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { requireMembership } from "./auth"
import { workspaceBudgets, type Budgets } from "./budgets"
import { recordAuditEvent, type AuditActor } from "./auditEvents"
import { checkQuery, queryRecords, type RecordQuery } from "./recordQuery"

type SaveQueryArgs = {
  collectionId: Id<"collections">
  name: string
  query: RecordQuery
  queryId?: Id<"queryDefinitions">
  expectedRevision?: number
}

/** Public contract: an immutable revision pins the source and result schema. */
export async function saveQuery(
  ctx: MutationCtx,
  args: SaveQueryArgs
): Promise<{ queryId: Id<"queryDefinitions">; revision: number }> {
  const collection = await ctx.db.get(args.collectionId)
  if (!collection) throw new Error("Collection access denied")
  const member = await requireMembership(ctx, collection.workspaceId)
  return saveQueryInWorkspace(
    ctx,
    collection.workspaceId,
    { kind: "user", userId: member.userId },
    args
  )
}

/**
 * Saves a query of a collection in `workspaceId`. The caller has already
 * proved access to the workspace (membership or an agent credential), and
 * `actor` names it in the audit event.
 */
export async function saveQueryInWorkspace(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  actor: AuditActor,
  args: SaveQueryArgs
): Promise<{ queryId: Id<"queryDefinitions">; revision: number }> {
  const collection = await ctx.db.get(args.collectionId)
  if (!collection || collection.workspaceId !== workspaceId)
    throw new Error("Collection access denied")
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
  await recordAuditEvent(ctx, collection.workspaceId, actor, {
    operation: "query.save",
    queryId,
    revision,
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

type RunSavedQueryArgs = {
  queryId: Id<"queryDefinitions">
  expectedRevision: number
  paginationOpts: PaginationOptions
}

/** The first page of a saved query, read with the workspace's full budget. */
export function firstPageWithinBudget(budgets: Budgets): PaginationOptions {
  return {
    cursor: null,
    numItems: 50,
    maximumRowsRead: budgets.queryRowsRead,
    maximumBytesRead: budgets.queryBytesRead,
  }
}

/** Membership is checked here so pages and the dashboard share one boundary. */
export async function runSavedQuery(
  ctx: QueryCtx,
  args: RunSavedQueryArgs
): Promise<SavedQueryPage> {
  const saved = await ctx.db.get(args.queryId)
  if (!saved) throw new Error("Query access denied")
  await requireMembership(ctx, saved.workspaceId)
  return runSavedQueryInWorkspace(ctx, saved.workspaceId, args)
}

/**
 * Runs a saved query revision of `workspaceId` within the page budget. The
 * caller has already proved access to the workspace.
 */
export async function runSavedQueryInWorkspace(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  args: RunSavedQueryArgs
): Promise<SavedQueryPage> {
  const saved = await ctx.db.get(args.queryId)
  if (!saved || saved.workspaceId !== workspaceId)
    throw new Error("Query access denied")
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
  const budgets = await workspaceBudgets(ctx, saved.workspaceId)
  const opts = args.paginationOpts
  if (
    !Number.isSafeInteger(opts.numItems) ||
    opts.numItems < 1 ||
    opts.numItems > 50 ||
    opts.maximumRowsRead === undefined ||
    !Number.isSafeInteger(opts.maximumRowsRead) ||
    opts.maximumRowsRead < 1 ||
    opts.maximumRowsRead > budgets.queryRowsRead ||
    opts.maximumBytesRead === undefined ||
    !Number.isSafeInteger(opts.maximumBytesRead) ||
    opts.maximumBytesRead < 1 ||
    opts.maximumBytesRead > budgets.queryBytesRead
  )
    throw new Error(
      `Query budget required: 1–50 results, at most ${budgets.queryRowsRead} rows and ${budgets.queryBytesRead} index bytes`
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

/** One saved query with its current revision, as agents list them. */
export type SavedQuerySummary = {
  queryId: Id<"queryDefinitions">
  collectionId: Id<"collections">
  name: string
  revision: number
  /** "stale" when the collection schema changed after this revision. */
  status: "current" | "stale"
  fields: Doc<"collections">["definition"]["fields"]
}

/** Lists the saved queries of `workspaceId`, one bounded page at a time. */
export async function listSavedQueries(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  paginationOpts: PaginationOptions
): Promise<PaginationResult<SavedQuerySummary>> {
  const result = await ctx.db
    .query("queryDefinitions")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .paginate(paginationOpts)
  const page: SavedQuerySummary[] = []
  for (const saved of result.page) {
    const version = await ctx.db
      .query("queryDefinitionVersions")
      .withIndex("by_queryId_and_revision", (q) =>
        q.eq("queryId", saved._id).eq("revision", saved.revision)
      )
      .unique()
    if (!version) continue
    const collection = await ctx.db.get(saved.collectionId)
    page.push({
      queryId: saved._id,
      collectionId: saved.collectionId,
      name: saved.name,
      revision: saved.revision,
      status:
        collection?.definition.version === version.schemaVersion
          ? "current"
          : "stale",
      fields: version.resultSchema.fields,
    })
  }
  return { ...result, page }
}
