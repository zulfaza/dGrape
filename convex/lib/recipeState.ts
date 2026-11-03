import { defineTable } from "convex/server"
import { v } from "convex/values"
import { recordValuesValidator } from "./collectionDomain"
import { recipeValidator } from "./recipeDomain"
import { recipeTimingValidator } from "./recipeSchedule"

export const runStateValidator = v.union(
  v.literal("pending"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("cancelled"),
  v.literal("skipped")
)
export const recipeTables = {
  recipeRunGrants: defineTable({
    versionId: v.id("recipeVersions"),
    userId: v.string(),
  }).index("by_versionId_and_userId", ["versionId", "userId"]),
  recipeCheckpoints: defineTable({
    runId: v.id("recipeRuns"),
    step: v.number(),
    rows: v.array(recordValuesValidator),
    sourceCursor: v.optional(v.union(v.string(), v.null())),
  }).index("by_runId_and_step", ["runId", "step"]),
  recipeVersions: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    recipe: recipeValidator,
    createdBy: v.string(),
  }).index("by_workspaceId", ["workspaceId"]),
  recipeSchedules: defineTable({
    workspaceId: v.id("workspaces"),
    versionId: v.id("recipeVersions"),
    timing: recipeTimingValidator,
    enabled: v.boolean(),
    nextAt: v.number(),
    activeRunId: v.optional(v.id("recipeRuns")),
  })
    .index("by_enabled_and_nextAt", ["enabled", "nextAt"])
    .index("by_workspaceId", ["workspaceId"]),
  recipeRuns: defineTable({
    workspaceId: v.id("workspaces"),
    versionId: v.id("recipeVersions"),
    scheduleId: v.optional(v.id("recipeSchedules")),
    key: v.string(),
    state: runStateValidator,
    cancelRequested: v.boolean(),
    leaseUntil: v.number(),
    epoch: v.number(),
    nextStep: v.number(),
    outputToken: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_workspaceId", ["workspaceId"])
    .index("by_workspaceId_and_key", ["workspaceId", "key"])
    .index("by_state_and_leaseUntil", ["state", "leaseUntil"]),
  recipeStepAttempts: defineTable({
    runId: v.id("recipeRuns"),
    step: v.number(),
    attempt: v.number(),
    state: v.union(
      v.literal("started"),
      v.literal("succeeded"),
      v.literal("failed")
    ),
    error: v.optional(v.literal("Step failed")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
  }).index("by_runId_and_step", ["runId", "step"]),
}
