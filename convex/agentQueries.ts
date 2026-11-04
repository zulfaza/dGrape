import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import { workspaceBudgets } from "./lib/budgets"
import { auditActor } from "./lib/auditEvents"
import {
  collectionDefinitionValidator,
  collectionFieldValidator,
  recordValuesValidator,
} from "./lib/collectionDomain"
import { savedQueryValidator } from "./lib/queryAggregate"
import {
  listSavedQueries,
  runSavedAggregateInWorkspace,
  runSavedQueryInWorkspace,
  savedAggregateValidator,
  saveQueryInWorkspace,
} from "./lib/savedQueries"
import { sourceStatusValidator } from "./lib/sourceSync"
import { agentOperation, runOnce } from "./lib/operations"

/**
 * Saved-query operations for agent credentials. convex/http.ts calls these
 * after it decodes the request with convex/lib/agentQueryTransport.ts. The
 * credential check and the operation share one transaction (withGrant).
 */

const savedQuery = v.object({
  queryId: v.id("queryDefinitions"),
  revision: v.number(),
})

/** Saves a query revision. See convex/lib/operations.ts for `idempotencyKey`. */
export const save = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    name: v.string(),
    query: savedQueryValidator,
    queryId: v.optional(v.string()),
    expectedRevision: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  returns: savedQuery,
  handler: (ctx, { digest, idempotencyKey, ...args }) =>
    withGrant(ctx, digest, Date.now(), ["data.write"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "queries.save", idempotencyKey, args),
        savedQuery,
        async () => {
          const collectionId = ctx.db.normalizeId(
            "collections",
            args.collectionId
          )
          if (!collectionId) throw new Error("Collection access denied")
          const queryId =
            args.queryId === undefined
              ? undefined
              : ctx.db.normalizeId("queryDefinitions", args.queryId)
          if (args.queryId !== undefined && !queryId)
            throw new Error("Query access denied")
          return saveQueryInWorkspace(
            ctx,
            grant.workspaceId,
            auditActor(grant.owner, grant),
            {
              collectionId,
              name: args.name,
              query: args.query,
              queryId: queryId ?? undefined,
              expectedRevision: args.expectedRevision,
            }
          )
        }
      )
    ),
})

export const list = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    page: v.array(
      v.object({
        queryId: v.id("queryDefinitions"),
        collectionId: v.id("collections"),
        name: v.string(),
        revision: v.number(),
        status: v.union(v.literal("current"), v.literal("stale")),
        fields: v.array(collectionFieldValidator),
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, ["data.read"], async (grant) => {
      const result = await listSavedQueries(ctx, grant.workspaceId, {
        numItems: args.numItems,
        cursor: args.cursor,
      })
      return {
        page: result.page,
        isDone: result.isDone,
        continueCursor: result.continueCursor,
      }
    }),
})

export const run = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    queryId: v.string(),
    revision: v.number(),
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    queryId: v.id("queryDefinitions"),
    revision: v.number(),
    resultSchema: collectionDefinitionValidator,
    page: v.array(
      v.object({
        _id: v.id("collectionRecords"),
        _creationTime: v.number(),
        revision: v.number(),
        values: recordValuesValidator,
      })
    ),
    isDone: v.boolean(),
    continueCursor: v.string(),
    completeness: v.union(v.literal("complete"), v.literal("partial")),
    evaluatedAt: v.number(),
    dataAsOf: v.union(v.number(), v.null()),
    source: sourceStatusValidator,
  }),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, ["data.read"], async (grant) => {
      const queryId = ctx.db.normalizeId("queryDefinitions", args.queryId)
      if (!queryId) throw new Error("Query access denied")
      const budgets = await workspaceBudgets(ctx, grant.workspaceId)
      const result = await runSavedQueryInWorkspace(ctx, grant.workspaceId, {
        queryId,
        expectedRevision: args.revision,
        paginationOpts: {
          numItems: args.numItems,
          cursor: args.cursor,
          maximumRowsRead: budgets.queryRowsRead,
          maximumBytesRead: budgets.queryBytesRead,
        },
      })
      return {
        queryId: result.queryId,
        revision: result.revision,
        resultSchema: result.resultSchema,
        page: result.page.map(({ _id, _creationTime, revision, values }) => ({
          _id,
          _creationTime,
          revision,
          values,
        })),
        isDone: result.isDone,
        continueCursor: result.continueCursor,
        completeness: result.completeness,
        evaluatedAt: result.evaluatedAt,
        dataAsOf: result.dataAsOf,
        source: result.source,
      }
    }),
})

export const aggregate = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    queryId: v.string(),
    revision: v.number(),
  },
  returns: savedAggregateValidator,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, ["data.read"], async (grant) => {
      const queryId = ctx.db.normalizeId("queryDefinitions", args.queryId)
      if (!queryId) throw new Error("Query access denied")
      return runSavedAggregateInWorkspace(ctx, grant.workspaceId, {
        queryId,
        expectedRevision: args.revision,
      })
    }),
})
