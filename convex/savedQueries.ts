import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import {
  collectionDefinitionValidator,
  collectionRecordValidator,
} from "./lib/collectionDomain"
import { recordQueryValidator } from "./lib/recordQuery"
import { runSavedQuery, saveQuery } from "./lib/savedQueries"

export const save = mutation({
  args: {
    collectionId: v.id("collections"),
    name: v.string(),
    query: recordQueryValidator,
    queryId: v.optional(v.id("queryDefinitions")),
    expectedRevision: v.optional(v.number()),
  },
  returns: v.object({
    queryId: v.id("queryDefinitions"),
    revision: v.number(),
  }),
  handler: saveQuery,
})

export const run = query({
  args: {
    queryId: v.id("queryDefinitions"),
    expectedRevision: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(collectionRecordValidator).extend({
    queryId: v.id("queryDefinitions"),
    revision: v.number(),
    resultSchema: collectionDefinitionValidator,
    completeness: v.union(v.literal("complete"), v.literal("partial")),
    freshness: v.literal("live"),
    readAt: v.number(),
  }),
  handler: runSavedQuery,
})
