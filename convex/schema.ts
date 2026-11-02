import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { agentScopeValidator } from "./lib/agentScope";
import { collectionFieldValidator } from "./lib/collectionDomain";

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
    definition: v.object({
      version: v.literal(1),
      fields: v.array(collectionFieldValidator),
    }),
  }).index("by_workspace", ["workspaceId"]),
  collectionRecords: defineTable({
    collectionId: v.id("collections"),
    schemaVersion: v.literal(1),
    revision: v.number(),
    values: v.record(v.string(), v.union(v.string(), v.number(), v.boolean())),
    /** Set by agent creates so a retried request returns the same record. */
    idempotencyKey: v.optional(v.string()),
  })
    .index("by_collection", ["collectionId"])
    .index("by_collection_idempotencyKey", ["collectionId", "idempotencyKey"]),
});
