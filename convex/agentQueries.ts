import { v } from "convex/values"
import { internalMutation, internalQuery } from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import {
  collectionDefinitionValidator,
  collectionFieldValidator,
  recordValuesValidator,
} from "./lib/collectionDomain"
import { recordQueryValidator } from "./lib/recordQuery"
import {
  listSavedQueries,
  runSavedQueryInWorkspace,
  saveQueryInWorkspace,
} from "./lib/savedQueries"

/**
 * Saved-query operations for agent credentials. convex/http.ts calls these
 * after it decodes the request with convex/lib/agentQueryTransport.ts. The
 * credential check and the operation share one transaction (withGrant).
 */

const MAX_ROWS_READ = 100
const MAX_BYTES_READ = 1_000_000

export const save = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    name: v.string(),
    query: recordQueryValidator,
    queryId: v.optional(v.string()),
    expectedRevision: v.optional(v.number()),
  },
  returns: v.object({
    queryId: v.id("queryDefinitions"),
    revision: v.number(),
  }),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const collectionId = ctx.db.normalizeId("collections", args.collectionId)
      if (!collectionId) throw new Error("Collection access denied")
      const queryId =
        args.queryId === undefined
          ? undefined
          : ctx.db.normalizeId("queryDefinitions", args.queryId)
      if (args.queryId !== undefined && !queryId)
        throw new Error("Query access denied")
      return saveQueryInWorkspace(ctx, grant.workspaceId, {
        collectionId,
        name: args.name,
        query: args.query,
        queryId: queryId ?? undefined,
        expectedRevision: args.expectedRevision,
      })
    }),
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
    withGrant(ctx, args.digest, args.now, "read", async (grant) => {
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
    freshness: v.literal("live"),
    readAt: v.number(),
  }),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, "read", async (grant) => {
      const queryId = ctx.db.normalizeId("queryDefinitions", args.queryId)
      if (!queryId) throw new Error("Query access denied")
      const result = await runSavedQueryInWorkspace(ctx, grant.workspaceId, {
        queryId,
        expectedRevision: args.revision,
        paginationOpts: {
          numItems: args.numItems,
          cursor: args.cursor,
          maximumRowsRead: MAX_ROWS_READ,
          maximumBytesRead: MAX_BYTES_READ,
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
        freshness: result.freshness,
        readAt: result.readAt,
      }
    }),
})
