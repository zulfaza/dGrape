import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { savedQueryValidator } from "./lib/queryAggregate"
import {
  runSavedAggregate,
  runSavedQuery,
  savedAggregateValidator,
  savedQueryPageValidator,
  saveQuery,
} from "./lib/savedQueries"

export const save = mutation({
  args: {
    collectionId: v.id("collections"),
    name: v.string(),
    query: savedQueryValidator,
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
  returns: savedQueryPageValidator,
  handler: runSavedQuery,
})

/** Reads the groups of a saved aggregate query revision. */
export const aggregate = query({
  args: {
    queryId: v.id("queryDefinitions"),
    expectedRevision: v.number(),
  },
  returns: savedAggregateValidator,
  handler: runSavedAggregate,
})
