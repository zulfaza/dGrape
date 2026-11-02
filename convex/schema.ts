import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { collectionFieldValidator } from "./lib/collectionDomain";
import { applicationStatusValidator } from "./lib/domain";
import { profileDocumentValidator } from "./lib/profileDomain";
import {
  applicationAgentMessageMetadataValidator,
  cvMatchAnalysisValidator,
  tailoredCvArtifactValidator,
} from "./lib/applicationAgentDomain";

export default defineSchema({
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
  companies: defineTable({
    normalizedName: v.string(),
    name: v.string(),
    summary: v.string(),
    industry: v.string(),
    hqLocation: v.string(),
    size: v.string(),
    logo: v.string(),
    banner: v.optional(v.string()),
    brandColor: v.optional(v.string()),
    website: v.string(),
    socials: v.object({
      linkedin: v.optional(v.string()),
      twitter: v.optional(v.string()),
      facebook: v.optional(v.string()),
      instagram: v.optional(v.string()),
      youtube: v.optional(v.string()),
      github: v.optional(v.string()),
    }),
    enrichedAt: v.number(),
  }).index("by_normalized_name", ["normalizedName"]),
  applications: defineTable({
    userId: v.string(),
    companyId: v.id("companies"),
    normalizedPosition: v.string(),
    position: v.string(),
    status: applicationStatusValidator,
    appliedOn: v.optional(v.number()),
    lastUpdate: v.number(),
    sourceUrl: v.optional(v.string()),
    jobDescription: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_company_position", ["userId", "companyId", "normalizedPosition"]),
  applicationAliases: defineTable({
    userId: v.string(),
    companyId: v.id("companies"),
    normalizedPosition: v.string(),
    applicationId: v.id("applications"),
  })
    .index("by_application", ["applicationId"])
    .index("by_user_company_position", ["userId", "companyId", "normalizedPosition"]),
  profiles: defineTable(profileDocumentValidator.fields).index("by_user", ["userId"]),
  applicationEvents: defineTable({
    applicationId: v.id("applications"),
    sourceEmailId: v.string(),
    type: applicationStatusValidator,
    date: v.number(),
    note: v.string(),
  })
    .index("by_application", ["applicationId"])
    .index("by_application_source_type_date", ["applicationId", "sourceEmailId", "type", "date"]),
  applicationAgentThreads: defineTable({
    userId: v.string(),
    applicationId: v.id("applications"),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_application", ["applicationId"])
    .index("by_user", ["userId"]),
  applicationAgentMessages: defineTable({
    threadId: v.id("applicationAgentThreads"),
    payload: v.union(
      v.object({ type: v.literal("user"), text: v.string() }),
      v.object({ type: v.literal("assistant_pending"), requestId: v.string() }),
      v.object({ type: v.literal("assistant_streaming"), text: v.string(), requestId: v.string() }),
      v.object({ type: v.literal("assistant_complete"), text: v.string() }),
      v.object({ type: v.literal("assistant_failed"), error: v.string() }),
    ),
    requestId: v.optional(v.string()),
    metadata: v.optional(applicationAgentMessageMetadataValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_thread_request", ["threadId", "requestId"]),
  tailoredCvDrafts: defineTable({
    userId: v.string(),
    applicationId: v.id("applications"),
    threadId: v.id("applicationAgentThreads"),
    sourceAssistantMessageId: v.id("applicationAgentMessages"),
    artifact: tailoredCvArtifactValidator,
    jobDescriptionSnapshot: v.string(),
    sourceProfileUpdatedAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_application", ["applicationId", "createdAt"])
    .index("by_thread", ["threadId", "createdAt"])
    .index("by_source_message", ["sourceAssistantMessageId"]),
  tailoredCvVersions: defineTable({
    userId: v.string(),
    applicationId: v.id("applications"),
    threadId: v.id("applicationAgentThreads"),
    sourceAssistantMessageId: v.id("applicationAgentMessages"),
    sourceDraftId: v.id("tailoredCvDrafts"),
    profileSnapshot: tailoredCvArtifactValidator.fields.profileSnapshot,
    analysis: cvMatchAnalysisValidator,
    jobDescriptionSnapshot: v.string(),
    sourceProfileUpdatedAt: v.number(),
    createdAt: v.number(),
    savedAt: v.number(),
  })
    .index("by_application", ["applicationId", "createdAt"])
    .index("by_source_draft", ["sourceDraftId"]),
});
