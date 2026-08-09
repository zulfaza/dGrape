import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

import { applicationStatusValidator } from "./lib/domain";
import { profileDocumentValidator } from "./lib/profileDomain";
import {
  applicationAgentMessageMetadataValidator,
  cvMatchAnalysisValidator,
  tailoredCvArtifactValidator,
} from "./lib/applicationAgentDomain";
import {
  applicationTaskTypeValidator,
  artifactStateValidator,
  artifactTypeValidator,
  candidatePreferencesValidator,
  evidenceKindValidator,
  evidenceVerificationValidator,
  fitAssessmentValidator,
  hiringStatusValidator,
  jobBriefValidator,
  preparationStatusValidator,
  ruleScopeValidator,
  ruleSourceValidator,
} from "./lib/workflowDomain";

export default defineSchema({
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
    preparationStatus: v.optional(preparationStatusValidator),
    hiringStatus: v.optional(hiringStatusValidator),
    archiveReason: v.optional(v.string()),
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
  candidatePreferences: defineTable({
    userId: v.string(),
    preferences: candidatePreferencesValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  candidateEvidence: defineTable({
    userId: v.string(),
    claim: v.string(),
    kind: evidenceKindValidator,
    source: v.string(),
    context: v.string(),
    verification: evidenceVerificationValidator,
    confidence: v.number(),
    reusable: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  candidateRules: defineTable({
    userId: v.string(),
    scope: ruleScopeValidator,
    roleFamily: v.optional(v.string()),
    instruction: v.string(),
    source: ruleSourceValidator,
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  candidateCvBaselines: defineTable({
    userId: v.string(),
    name: v.string(),
    roleFamilies: v.array(v.string()),
    profileSnapshot: tailoredCvArtifactValidator.fields.profileSnapshot,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  importRuns: defineTable({
    userId: v.string(),
    mode: v.union(v.literal("single"), v.literal("batch")),
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("complete"),
      v.literal("failed"),
    ),
    rawSnapshot: v.string(),
    discoveredRoleCount: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId", "createdAt"]),
  jobSources: defineTable({
    userId: v.string(),
    applicationId: v.optional(v.id("applications")),
    importRunId: v.optional(v.id("importRuns")),
    sourceType: v.union(v.literal("url"), v.literal("text"), v.literal("manual")),
    sourceUrl: v.optional(v.string()),
    rawSnapshot: v.string(),
    fetchedAt: v.number(),
  })
    .index("by_application", ["applicationId", "fetchedAt"])
    .index("by_import_run", ["importRunId"]),
  jobBriefs: defineTable({
    userId: v.string(),
    applicationId: v.id("applications"),
    brief: jobBriefValidator,
    jobDescriptionSnapshot: v.string(),
    sourceUpdatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_application", ["applicationId"]),
  fitAssessments: defineTable({
    userId: v.string(),
    applicationId: v.id("applications"),
    assessment: fitAssessmentValidator,
    jobBriefSnapshot: jobBriefValidator,
    profileUpdatedAt: v.number(),
    evidenceUpdatedAt: v.number(),
    preferencesUpdatedAt: v.number(),
    createdAt: v.number(),
  }).index("by_application", ["applicationId", "createdAt"]),
  applicationArtifacts: defineTable({
    userId: v.string(),
    applicationId: v.id("applications"),
    type: artifactTypeValidator,
    state: artifactStateValidator,
    title: v.string(),
    content: v.string(),
    sourceSnapshot: v.object({
      jobDescription: v.string(),
      jobBrief: v.optional(jobBriefValidator),
      jobBriefUpdatedAt: v.number(),
      profile: v.optional(tailoredCvArtifactValidator.fields.profileSnapshot),
      profileUpdatedAt: v.number(),
      evidence: v.array(
        v.object({ id: v.string(), claim: v.string(), updatedAt: v.number() }),
      ),
      rules: v.array(
        v.object({ id: v.string(), instruction: v.string(), updatedAt: v.number() }),
      ),
      baseline: v.optional(
        v.object({
          id: v.string(),
          name: v.string(),
          updatedAt: v.number(),
          profileSnapshot: tailoredCvArtifactValidator.fields.profileSnapshot,
        }),
      ),
      generator: v.union(
        v.object({ type: v.literal("manual") }),
        v.object({
          type: v.literal("model"),
          provider: v.string(),
          model: v.string(),
          generatedAt: v.number(),
        }),
      ),
    }),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_application", ["applicationId", "createdAt"]),
  applicationTasks: defineTable({
    userId: v.string(),
    applicationId: v.id("applications"),
    type: applicationTaskTypeValidator,
    title: v.string(),
    dueAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    contact: v.string(),
    note: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_application", ["applicationId", "createdAt"])
    .index("by_user_due", ["userId", "dueAt"]),
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
