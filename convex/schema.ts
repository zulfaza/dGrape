import { bindingFields } from "./lib/artifactBindingDomain"
import { pageFields, pageVersionFields } from "./lib/pageDomain"
import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

import { recordQueryValidator } from "./lib/recordQuery"
import { storedScopesValidator } from "./lib/agentScope"
import { artifactCreatorValidator } from "./lib/artifactDomain"
import {
  agentClaimAttemptValidator,
  agentRegistrationValidator,
} from "./lib/agentRegistration"
import {
  collectionDefinitionValidator,
  recordValueValidator,
} from "./lib/collectionDomain"

import { artifactUsageValidator } from "./lib/artifactUsage"
import { budgetOverridesValidator } from "./lib/budgets"
import { recordCountValidator } from "./lib/recordCounts"
import { auditEventFields } from "./lib/auditEvents"
import { recipeTables } from "./lib/recipeState"
import { secretFields, connectionFields } from "./lib/secretDomain"
import { sourceSyncFields } from "./lib/sourceSync"

export default defineSchema({
  ...recipeTables,
  /** Redacted change history; see convex/lib/auditEvents.ts. */
  auditEvents: defineTable(auditEventFields).index("by_workspaceId", [
    "workspaceId",
  ]),
  artifactBindings: defineTable(bindingFields).index("by_recordId", [
    "recordId",
  ]),
  pages: defineTable(pageFields).index("by_workspaceId", ["workspaceId"]),
  pageVersions: defineTable(pageVersionFields).index("by_pageId_and_revision", [
    "pageId",
    "revision",
  ]),
  secretRefs: defineTable(secretFields).index("by_workspaceId", [
    "workspaceId",
  ]),
  connections: defineTable(connectionFields).index("by_workspaceId", [
    "workspaceId",
  ]),
  connectionUseGrants: defineTable({
    connectionId: v.id("connections"),
    userId: v.string(),
    secretUse: v.boolean(),
  }).index("by_connectionId_and_userId", ["connectionId", "userId"]),
  agentGrants: defineTable({
    workspaceId: v.id("workspaces"),
    owner: v.string(),
    digest: v.string(),
    scope: storedScopesValidator,
    state: v.union(v.literal("active"), v.literal("revoked")),
    expiresAt: v.number(),
    /** Set for tokens issued to an auth.md registration. */
    registrationId: v.optional(v.id("agentRegistrations")),
  })
    .index("by_digest", ["digest"])
    .index("by_workspace_owner", ["workspaceId", "owner"])
    .index("by_workspace_owner_state_expiresAt", [
      "workspaceId",
      "owner",
      "state",
      "expiresAt",
    ]),
  /** auth.md user-claimed registrations; see convex/lib/agentRegistration.ts. */
  agentRegistrations: defineTable(agentRegistrationValidator)
    .index("by_claimTokenDigest", ["claimTokenDigest"])
    .index("by_workspaceId_and_owner", ["workspaceId", "owner"])
    .index("by_loginHint_and_status_and_claimExpiresAt", [
      "loginHint",
      "status",
      "claimExpiresAt",
    ]),
  agentClaimAttempts: defineTable(agentClaimAttemptValidator)
    .index("by_attemptTokenDigest", ["attemptTokenDigest"])
    .index("by_registrationId", ["registrationId"]),
  /** Uploads waiting for their file; see convex/lib/artifacts.ts. */
  artifactUploads: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    name: v.string(),
    createdBy: artifactCreatorValidator,
    expiresAt: v.number(),
  }).index("by_key", ["key"]),
  /** Private files in R2, with their provenance. */
  artifacts: defineTable({
    workspaceId: v.id("workspaces"),
    key: v.string(),
    name: v.string(),
    contentType: v.string(),
    dataTimestamp: v.optional(v.number()),
    size: v.number(),
    createdBy: artifactCreatorValidator,
  }).index("by_workspaceId", ["workspaceId"]),
  workspaces: defineTable({
    name: v.string(),
    /** Budgets the owner changed; see convex/lib/budgets.ts. */
    budgets: v.optional(budgetOverridesValidator),
  }),
  /** One row per workspace; see convex/lib/artifactUsage.ts. */
  workspaceUsage: defineTable({
    workspaceId: v.id("workspaces"),
    artifacts: artifactUsageValidator,
  }).index("by_workspaceId", ["workspaceId"]),
  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.literal("owner"),
  })
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),
  reportCounts: defineTable({
    queryId: v.id("queryDefinitions"),
    revision: v.number(),
    sourceRevision: v.number(),
    builtAt: v.number(),
    result: v.union(
      v.object({
        kind: v.literal("building"),
        count: v.number(),
        cursor: v.union(v.string(), v.null()),
        pages: v.number(),
        schemaVersion: v.number(),
        requestedBy: v.string(),
      }),
      v.object({ kind: v.literal("complete"), count: v.number() }),
      v.object({ kind: v.literal("failed"), message: v.string() })
    ),
  }).index("by_queryId_and_revision", ["queryId", "revision"]),
  collections: defineTable({
    dataRevision: v.optional(v.number()),
    /** See convex/lib/recordCounts.ts. */
    recordCount: v.optional(recordCountValidator),
    workspaceId: v.id("workspaces"),
    name: v.string(),
    definition: collectionDefinitionValidator,
  }).index("by_workspace", ["workspaceId"]),
  collectionSchemaVersions: defineTable({
    collectionId: v.id("collections"),
    definition: collectionDefinitionValidator,
  }).index("by_collectionId_and_version", [
    "collectionId",
    "definition.version",
  ]),
  collectionRecords: defineTable({
    collectionId: v.id("collections"),
    /** The collection's definition version when this record was last written. */
    schemaVersion: v.number(),
    revision: v.number(),
    values: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
    /** Set by agent creates so a retried request returns the same record. */
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_collection", ["collectionId"])
    .index("by_collection_idempotencyKey", ["collectionId", "idempotencyKey"]),
  /**
   * One row per indexed field value of a record, so records can be filtered
   * and sorted by that field with a bounded index range. convex/lib/records.ts
   * keeps these rows in step with every record write.
   */
  queryDefinitions: defineTable({
    workspaceId: v.id("workspaces"),
    collectionId: v.id("collections"),
    name: v.string(),
    revision: v.number(),
  }).index("by_workspaceId", ["workspaceId"]),
  queryDefinitionVersions: defineTable({
    queryId: v.id("queryDefinitions"),
    revision: v.number(),
    schemaVersion: v.number(),
    resultSchema: collectionDefinitionValidator,
    query: recordQueryValidator,
  }).index("by_queryId_and_revision", ["queryId", "revision"]),
  recordIdentities: defineTable({
    collectionId: v.id("collections"),
    source: v.string(),
    key: v.string(),
    recordId: v.id("collectionRecords"),
  })
    .index("by_collectionId_and_source_and_key", [
      "collectionId",
      "source",
      "key",
    ])
    .index("by_recordId", ["recordId"]),
  /** Last recipe run outcome for each source collection. */
  sourceSyncs: defineTable(sourceSyncFields).index("by_collectionId", [
    "collectionId",
  ]),
  sourceCursors: defineTable({
    collectionId: v.id("collections"),
    source: v.string(),
    cursor: v.string(),
  }).index("by_collectionId_and_source", ["collectionId", "source"]),
  snapshotGenerations: defineTable({
    collectionId: v.id("collections"),
    generation: v.string(),
    schemaVersion: v.number(),
    published: v.boolean(),
    createdAt: v.number(),
  }).index("by_collectionId_and_generation", ["collectionId", "generation"]),
  snapshotChunks: defineTable({
    generationId: v.id("snapshotGenerations"),
    chunkId: v.string(),
    digest: v.string(),
    count: v.number(),
  }).index("by_generationId_and_chunkId", ["generationId", "chunkId"]),
  snapshotRows: defineTable({
    generationId: v.id("snapshotGenerations"),
    chunkId: v.string(),
    values: v.record(v.string(), recordValueValidator),
  }).index("by_generationId", ["generationId"]),
  snapshotPublications: defineTable({
    collectionId: v.id("collections"),
    generation: v.string(),
    generationId: v.id("snapshotGenerations"),
    publishedAt: v.number(),
    rowCount: v.number(),
  }).index("by_collectionId", ["collectionId"]),
  recordIndexEntries: defineTable({
    collectionId: v.id("collections"),
    recordId: v.id("collectionRecords"),
    fieldId: v.string(),
    value: recordValueValidator,
  })
    .index("by_collectionId_and_fieldId_and_value", [
      "collectionId",
      "fieldId",
      "value",
    ])
    .index("by_recordId", ["recordId"]),
})
