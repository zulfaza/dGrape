import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { agentScopeValidator } from "./lib/agentScope";
import {
  agentClaimAttemptValidator,
  agentRegistrationValidator,
} from "./lib/agentRegistration";
import {
  collectionDefinitionValidator,
  recordValueValidator,
} from "./lib/collectionDomain";

export default defineSchema({
  agentGrants: defineTable({
    workspaceId: v.id("workspaces"),
    owner: v.string(),
    digest: v.string(),
    scope: agentScopeValidator,
    state: v.union(v.literal("active"), v.literal("revoked")),
    expiresAt: v.number(),
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
    .index("by_loginHint_and_status_and_claimExpiresAt", [
      "loginHint",
      "status",
      "claimExpiresAt",
    ]),
  agentClaimAttempts: defineTable(agentClaimAttemptValidator)
    .index("by_attemptTokenDigest", ["attemptTokenDigest"])
    .index("by_registrationId", ["registrationId"]),
  workspaces: defineTable({ name: v.string() }),
  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: v.literal("owner"),
  })
    .index("by_user", ["userId"])
    .index("by_workspace_user", ["workspaceId", "userId"]),
  collections: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(),
    definition: collectionDefinitionValidator,
  }).index("by_workspace", ["workspaceId"]),
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
});
