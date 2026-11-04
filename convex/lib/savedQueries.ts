import {
  paginationResultValidator,
  type PaginationOptions,
  type PaginationResult,
} from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { requireMembership } from "./auth"
import { workspaceBudgets, type Budgets } from "./budgets"
import { recordAuditEvent, type AuditActor } from "./auditEvents"
import {
  collectionDefinitionValidator,
  collectionRecordValidator,
  recordValuesValidator,
} from "./collectionDomain"
import {
  aggregateRecords,
  checkSavedQuery,
  savedQueryFields,
  type AggregateRow,
  type SavedQuery,
} from "./queryAggregate"
import { queryTooExpensive } from "./queryErrors"
import { queryRecords } from "./recordQuery"
import {
  dataAsOf,
  readSourceStatus,
  sourceStatusValidator,
  type SourceStatus,
} from "./sourceSync"

type SaveQueryArgs = {
  collectionId: Id<"collections">
  name: string
  query: SavedQuery
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
  const member = await requireMembership(ctx, collection.workspaceId, "write")
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
  const checked = checkSavedQuery(collection.definition.fields, args.query)
  if (!checked.ok) throw new Error(checked.message)
  const resultFields = savedQueryFields(
    collection.definition.fields,
    checked.value
  )
  if (!resultFields.ok) throw new Error(resultFields.message)
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
    resultSchema: {
      version: collection.definition.version,
      fields: resultFields.value,
    },
    query: checked.value,
  })
  await recordAuditEvent(ctx, collection.workspaceId, actor, {
    operation: "query.save",
    queryId,
    revision,
  })
  return { queryId, revision }
}

/**
 * A saved query page with its source freshness. `evaluatedAt` is when the
 * query read the records. `dataAsOf` is the last successful sync of the
 * source, or null when no sync succeeded. An empty page is not a sync state.
 */
export const savedQueryPageValidator = paginationResultValidator(
  collectionRecordValidator
).extend({
  kind: v.literal("records"),
  queryId: v.id("queryDefinitions"),
  revision: v.number(),
  resultSchema: collectionDefinitionValidator,
  completeness: v.union(v.literal("complete"), v.literal("partial")),
  evaluatedAt: v.number(),
  dataAsOf: v.union(v.number(), v.null()),
  source: sourceStatusValidator,
})
export type SavedQueryPage = PaginationResult<Doc<"collectionRecords">> & {
  kind: "records"
  queryId: Id<"queryDefinitions">
  revision: number
  resultSchema: Doc<"collections">["definition"]
  completeness: "complete" | "partial"
  evaluatedAt: number
  dataAsOf: number | null
  source: SourceStatus
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
  await requireMembership(ctx, saved.workspaceId, "read")
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
  const { saved, version, collection } = await runnableRevision(
    ctx,
    workspaceId,
    args.queryId,
    args.expectedRevision
  )
  if (version.query.aggregate !== undefined)
    throw new Error(
      "This query aggregates records; read it with the aggregate operation"
    )
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
    throw queryTooExpensive("resultBytes", opts.maximumBytesRead)
  const source = await readSourceStatus(ctx, collection)
  return {
    kind: "records",
    queryId: saved._id,
    revision: version.revision,
    resultSchema: version.resultSchema,
    ...result.value,
    completeness:
      result.value.isDone && result.value.pageStatus !== "SplitRequired"
        ? "complete"
        : "partial",
    evaluatedAt: Date.now(),
    dataAsOf: dataAsOf(source.freshness),
    source,
  }
}

/**
 * A saved query revision that can run now: it is in `workspaceId` and was
 * saved for the current schema of its collection.
 */
async function runnableRevision(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  queryId: Id<"queryDefinitions">,
  revision: number
) {
  const saved = await ctx.db.get(queryId)
  if (!saved || saved.workspaceId !== workspaceId)
    throw new Error("Query access denied")
  const version = await ctx.db
    .query("queryDefinitionVersions")
    .withIndex("by_queryId_and_revision", (q) =>
      q.eq("queryId", saved._id).eq("revision", revision)
    )
    .unique()
  if (!version) throw new Error("Query revision mismatch")
  const collection = await ctx.db.get(saved.collectionId)
  if (!collection || collection.workspaceId !== saved.workspaceId)
    throw new Error("Collection access denied")
  if (version.schemaVersion !== collection.definition.version)
    throw new Error("Query schema mismatch; save a new revision")
  return { saved, version, collection }
}

/**
 * The groups of an aggregate query with its source freshness. It is always
 * complete: a query that matches more records than one bounded read fails
 * with QueryTooExpensive instead. `rowsRead` is the index rows it read.
 */
export const savedAggregateValidator = v.object({
  kind: v.literal("aggregate"),
  queryId: v.id("queryDefinitions"),
  revision: v.number(),
  resultSchema: collectionDefinitionValidator,
  rows: v.array(v.object({ key: v.string(), values: recordValuesValidator })),
  rowsRead: v.number(),
  completeness: v.literal("complete"),
  evaluatedAt: v.number(),
  dataAsOf: v.union(v.number(), v.null()),
  source: sourceStatusValidator,
})
export type SavedAggregate = {
  kind: "aggregate"
  queryId: Id<"queryDefinitions">
  revision: number
  resultSchema: Doc<"collections">["definition"]
  rows: AggregateRow[]
  rowsRead: number
  completeness: "complete"
  evaluatedAt: number
  dataAsOf: number | null
  source: SourceStatus
}

type RunSavedAggregateArgs = {
  queryId: Id<"queryDefinitions">
  expectedRevision: number
}

/** Membership is checked here, as in runSavedQuery. */
export async function runSavedAggregate(
  ctx: QueryCtx,
  args: RunSavedAggregateArgs
): Promise<SavedAggregate> {
  const saved = await ctx.db.get(args.queryId)
  if (!saved) throw new Error("Query access denied")
  await requireMembership(ctx, saved.workspaceId)
  return runSavedAggregateInWorkspace(ctx, saved.workspaceId, args)
}

/**
 * Runs a saved aggregate revision of `workspaceId` over one read of at most
 * the workspace's query row and byte budgets. The caller has already proved
 * access to the workspace.
 */
export async function runSavedAggregateInWorkspace(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  args: RunSavedAggregateArgs
): Promise<SavedAggregate> {
  const { saved, version, collection } = await runnableRevision(
    ctx,
    workspaceId,
    args.queryId,
    args.expectedRevision
  )
  const { aggregate } = version.query
  if (aggregate === undefined)
    throw new Error("This query has no aggregate; run it to read its records")
  const budgets = await workspaceBudgets(ctx, saved.workspaceId)
  const result = await queryRecords(ctx, collection, version.query, {
    cursor: null,
    numItems: budgets.queryRowsRead,
    maximumRowsRead: budgets.queryRowsRead,
    maximumBytesRead: budgets.queryBytesRead,
  })
  if (!result.ok) throw new Error(result.message)
  const { page, isDone, pageStatus } = result.value
  if (!isDone || pageStatus === "SplitRequired")
    throw queryTooExpensive("rowsRead", budgets.queryRowsRead)
  const source = await readSourceStatus(ctx, collection)
  return {
    kind: "aggregate",
    queryId: saved._id,
    revision: version.revision,
    resultSchema: version.resultSchema,
    rows: aggregateRecords(
      aggregate,
      version.query.order,
      page.map((record) => record.values)
    ),
    rowsRead: page.length,
    completeness: "complete",
    evaluatedAt: Date.now(),
    dataAsOf: dataAsOf(source.freshness),
    source,
  }
}

/**
 * The first page of a record query, or the groups of an aggregate query, as
 * live page blocks read them. Membership is checked here.
 */
export async function readSavedResult(
  ctx: QueryCtx,
  args: RunSavedQueryArgs
): Promise<SavedQueryPage | SavedAggregate> {
  const saved = await ctx.db.get(args.queryId)
  if (!saved) throw new Error("Query access denied")
  await requireMembership(ctx, saved.workspaceId)
  const { version } = await runnableRevision(
    ctx,
    saved.workspaceId,
    args.queryId,
    args.expectedRevision
  )
  return version.query.aggregate === undefined
    ? runSavedQueryInWorkspace(ctx, saved.workspaceId, args)
    : runSavedAggregateInWorkspace(ctx, saved.workspaceId, args)
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
