import { Effect } from "effect";
import { v } from "convex/values";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel.d.ts";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { requireUserId } from "./lib/auth";
import {
  applicationAgentMessageMetadataValidator,
  tailoredCvArtifactValidator,
} from "./lib/applicationAgentDomain";
import { LlmService, LlmServiceLive } from "./lib/services";

const MAX_MESSAGE_LENGTH = 8_000;
const MAX_TITLE_LENGTH = 80;
const MESSAGE_CONTEXT_LIMIT = 24;

export const listThreads = query({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const userId = await requireUserId(ctx);
    const application = await getOwnedApplication(ctx, userId, applicationId);
    if (!application) return [];
    const threads = await ctx.db
      .query("applicationAgentThreads")
      .withIndex("by_application", (q) => q.eq("applicationId", application._id))
      .collect();
    return threads
      .filter((thread) => thread.deletedAt === undefined)
      .slice()
      .sort((left, right) => right.updatedAt - left.updatedAt);
  },
});

export const getThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const userId = await requireUserId(ctx);
    const thread = await getOwnedThread(ctx, userId, threadId);
    if (!thread) return null;
    const [messages, drafts] = await Promise.all([
      ctx.db
        .query("applicationAgentMessages")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .collect(),
      ctx.db
        .query("tailoredCvDrafts")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .collect(),
    ]);
    const draftsWithVersions = await Promise.all(
      drafts.map(async (draft) => {
        const version = await ctx.db
          .query("tailoredCvVersions")
          .withIndex("by_source_draft", (q) => q.eq("sourceDraftId", draft._id))
          .unique();
        return {
          ...draft,
          artifact: {
            ...draft.artifact,
            profileSnapshot: {
              ...draft.artifact.profileSnapshot,
              experience: draft.artifact.profileSnapshot.experience.map((entry) => ({
                ...entry,
                role: entry.role ?? "",
              })),
            },
          },
          savedVersionId: version?._id,
        };
      }),
    );
    return {
      thread,
      messages: messages.map(({ metadata: _metadata, ...message }) => message),
      drafts: draftsWithVersions,
    };
  },
});

export const createThread = mutation({
  args: { applicationId: v.string() },
  returns: v.id("applicationAgentThreads"),
  handler: async (ctx, { applicationId }) => {
    const userId = await requireUserId(ctx);
    const application = await getOwnedApplication(ctx, userId, applicationId);
    if (!application) throw new Error("Application not found");
    const now = Date.now();
    return await ctx.db.insert("applicationAgentThreads", {
      userId,
      applicationId: application._id,
      title: "New chat",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const renameThread = mutation({
  args: { threadId: v.string(), title: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId, title }) => {
    const userId = await requireUserId(ctx);
    const thread = await getOwnedThread(ctx, userId, threadId);
    if (!thread) throw new Error("Chat not found");
    const normalizedTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
    if (!normalizedTitle) throw new Error("Chat title is required");
    await ctx.db.patch(thread._id, { title: normalizedTitle, updatedAt: Date.now() });
    return null;
  },
});

export const deleteThread = mutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    const userId = await requireUserId(ctx);
    const thread = await getOwnedThread(ctx, userId, threadId);
    if (!thread) throw new Error("Chat not found");
    await assertNoPendingResponse(ctx, thread._id);
    const now = Date.now();
    await ctx.db.patch(thread._id, { deletedAt: now, updatedAt: now });
    return null;
  },
});

export const sendMessage = action({
  args: { threadId: v.string(), text: v.string(), requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const started = await ctx.runMutation(internal.applicationAgent.beginMessage, {
      userId,
      threadId: args.threadId,
      text: args.text,
      requestId: args.requestId,
    });
    if (!started.shouldGenerate) return null;
    await generateResponse(ctx, userId, started.assistantMessageId);
    return null;
  },
});

export const streamMessage = action({
  args: { threadId: v.string(), text: v.string(), requestId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const started = await ctx.runMutation(internal.applicationAgent.beginMessage, {
      userId,
      threadId: args.threadId,
      text: args.text,
      requestId: args.requestId,
    });
    if (!started.shouldGenerate) return null;
    await generateResponse(ctx, userId, started.assistantMessageId, true);
    return null;
  },
});

export const retryResponse = action({
  args: { messageId: v.string() },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const userId = await requireUserId(ctx);
    const started = await ctx.runMutation(internal.applicationAgent.beginRetry, {
      userId,
      messageId,
    });
    await generateResponse(ctx, userId, started.assistantMessageId, true);
    return null;
  },
});

export const saveTailoredCvDraft = mutation({
  args: { draftId: v.string() },
  returns: v.id("tailoredCvVersions"),
  handler: async (ctx, { draftId }) => {
    const userId = await requireUserId(ctx);
    const normalizedDraftId = ctx.db.normalizeId("tailoredCvDrafts", draftId);
    if (!normalizedDraftId) throw new Error("CV draft not found");
    const draft = await ctx.db.get(normalizedDraftId);
    if (!draft || draft.userId !== userId) throw new Error("CV draft not found");
    const existing = await ctx.db
      .query("tailoredCvVersions")
      .withIndex("by_source_draft", (q) => q.eq("sourceDraftId", normalizedDraftId))
      .unique();
    if (existing) return existing._id;
    const now = Date.now();
    return await ctx.db.insert("tailoredCvVersions", {
      userId,
      applicationId: draft.applicationId,
      threadId: draft.threadId,
      sourceAssistantMessageId: draft.sourceAssistantMessageId,
      sourceDraftId: draft._id,
      profileSnapshot: draft.artifact.profileSnapshot,
      analysis: draft.artifact.analysis,
      jobDescriptionSnapshot: draft.jobDescriptionSnapshot,
      sourceProfileUpdatedAt: draft.sourceProfileUpdatedAt,
      createdAt: draft.createdAt,
      savedAt: now,
    });
  },
});

export const deleteTailoredCvVersion = mutation({
  args: { versionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { versionId }) => {
    const userId = await requireUserId(ctx);
    const normalizedVersionId = ctx.db.normalizeId("tailoredCvVersions", versionId);
    if (!normalizedVersionId) throw new Error("CV version not found");
    const version = await ctx.db.get(normalizedVersionId);
    if (!version || version.userId !== userId) throw new Error("CV version not found");
    await ctx.db.delete(version._id);
    return null;
  },
});

export const listTailoredCvVersions = query({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const userId = await requireUserId(ctx);
    const application = await getOwnedApplication(ctx, userId, applicationId);
    if (!application) return [];
    const versions = await ctx.db
      .query("tailoredCvVersions")
      .withIndex("by_application", (q) => q.eq("applicationId", application._id))
      .collect();
    return versions
      .slice()
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((version, index) => ({
        ...version,
        versionNumber: index + 1,
      }))
      .reverse();
  },
});

export const getTailoredCvVersion = query({
  args: { versionId: v.string() },
  handler: async (ctx, { versionId }) => {
    const userId = await requireUserId(ctx);
    const normalizedVersionId = ctx.db.normalizeId("tailoredCvVersions", versionId);
    if (!normalizedVersionId) return null;
    const version = await ctx.db.get(normalizedVersionId);
    if (!version || version.userId !== userId) return null;
    const versions = await ctx.db
      .query("tailoredCvVersions")
      .withIndex("by_application", (q) => q.eq("applicationId", version.applicationId))
      .collect();
    const ordered = versions.slice().sort((left, right) => left.createdAt - right.createdAt);
    return {
      ...version,
      profileSnapshot: {
        ...version.profileSnapshot,
        experience: version.profileSnapshot.experience.map((entry) => ({
          ...entry,
          role: entry.role ?? "",
        })),
      },
      versionNumber: ordered.findIndex((candidate) => candidate._id === version._id) + 1,
    };
  },
});

export const beginMessage = internalMutation({
  args: {
    userId: v.string(),
    threadId: v.string(),
    text: v.string(),
    requestId: v.string(),
  },
  returns: v.object({
    assistantMessageId: v.id("applicationAgentMessages"),
    shouldGenerate: v.boolean(),
  }),
  handler: async (ctx, { userId, threadId, text, requestId }) => {
    const thread = await getOwnedThread(ctx, userId, threadId);
    if (!thread) throw new Error("Chat not found");
    const normalizedText = text.trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!normalizedText) throw new Error("Message is required");
    const normalizedRequestId = requestId.trim();
    if (!normalizedRequestId) throw new Error("Request ID is required");
    const existing = await ctx.db
      .query("applicationAgentMessages")
      .withIndex("by_thread_request", (q) =>
        q.eq("threadId", thread._id).eq("requestId", normalizedRequestId),
      )
      .unique();
    if (existing) {
      return {
        assistantMessageId: existing._id,
        shouldGenerate: false,
      };
    }
    await assertNoPendingResponse(ctx, thread._id);
    const now = Date.now();
    await ctx.db.insert("applicationAgentMessages", {
      threadId: thread._id,
      payload: { type: "user", text: normalizedText },
      createdAt: now,
      updatedAt: now,
    });
    const assistantMessageId = await ctx.db.insert("applicationAgentMessages", {
      threadId: thread._id,
      payload: { type: "assistant_pending", requestId: normalizedRequestId },
      requestId: normalizedRequestId,
      createdAt: now + 1,
      updatedAt: now,
    });
    await ctx.db.patch(thread._id, {
      title: thread.title === "New chat" ? titleFromMessage(normalizedText) : thread.title,
      updatedAt: now,
    });
    return { assistantMessageId, shouldGenerate: true };
  },
});

export const beginRetry = internalMutation({
  args: { userId: v.string(), messageId: v.string() },
  returns: v.object({ assistantMessageId: v.id("applicationAgentMessages") }),
  handler: async (ctx, { userId, messageId }) => {
    const normalizedMessageId = ctx.db.normalizeId("applicationAgentMessages", messageId);
    if (!normalizedMessageId) throw new Error("Message not found");
    const message = await ctx.db.get(normalizedMessageId);
    if (!message) throw new Error("Message not found");
    const thread = await getOwnedThread(ctx, userId, message.threadId);
    if (!thread || message.payload.type !== "assistant_failed" || !message.requestId) {
      throw new Error("Message cannot be retried");
    }
    await assertNoPendingResponse(ctx, thread._id);
    await ctx.db.patch(message._id, {
      payload: { type: "assistant_pending", requestId: message.requestId },
      metadata: undefined,
      updatedAt: Date.now(),
    });
    return { assistantMessageId: message._id };
  },
});

export const getGenerationContext = internalQuery({
  args: { userId: v.string(), assistantMessageId: v.id("applicationAgentMessages") },
  handler: async (ctx, { userId, assistantMessageId }) => {
    const assistantMessage = await ctx.db.get(assistantMessageId);
    if (!assistantMessage || assistantMessage.payload.type !== "assistant_pending") {
      throw new Error("Pending message not found");
    }
    const thread = await getOwnedThread(ctx, userId, assistantMessage.threadId);
    if (!thread) throw new Error("Chat not found");
    const application = await ctx.db.get(thread.applicationId);
    if (!application || application.userId !== userId) throw new Error("Application not found");
    const [company, profile, messages, versions, latestDraft] = await Promise.all([
      ctx.db.get(application.companyId),
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("applicationAgentMessages")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .collect(),
      ctx.db
        .query("tailoredCvVersions")
        .withIndex("by_application", (q) => q.eq("applicationId", application._id))
        .collect(),
      ctx.db
        .query("tailoredCvDrafts")
        .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
        .order("desc")
        .first(),
    ]);
    const savedProfile = profile
      ? {
          name: profile.name,
          summary: profile.summary,
          contacts: profile.contacts,
          links: profile.links,
          skills: profile.skills ?? [],
          skillGroups: [],
          experience: profile.experience.map((entry) => ({
            ...entry,
            role: entry.role ?? "",
            position: entry.position ?? "",
          })),
          educations: profile.educations,
        }
      : null;
    const sourceProfile =
      latestDraft && latestDraft.sourceProfileUpdatedAt === profile?.updatedAt
        ? {
            ...latestDraft.artifact.profileSnapshot,
            skills: latestDraft.artifact.profileSnapshot.skills ?? [],
            skillGroups: latestDraft.artifact.profileSnapshot.skillGroups ?? [],
            experience: latestDraft.artifact.profileSnapshot.experience.map((entry) => ({
              ...entry,
              role: entry.role ?? "",
            })),
          }
        : savedProfile;
    const conversation = messages
      .filter(
        (
          message,
        ): message is Doc<"applicationAgentMessages"> & {
          payload: { type: "user"; text: string } | { type: "assistant_complete"; text: string };
        } => message.payload.type === "user" || message.payload.type === "assistant_complete",
      )
      .slice(-MESSAGE_CONTEXT_LIMIT)
      .map((message) => ({
        role: messageRole(message.payload.type),
        text: message.payload.text,
      }));
    const latestUserRequest = conversation.reduce(
      (latest, message) => (message.role === "user" ? message.text : latest),
      "",
    );
    return {
      application: {
        position: application.position,
        status: application.status,
        jobDescription: application.jobDescription ?? "",
        company: {
          name: company?.name ?? "Unknown",
          summary: company?.summary ?? "",
          industry: company?.industry ?? "",
          website: company?.website ?? "",
        },
      },
      profile: sourceProfile,
      profileUpdatedAt: profile?.updatedAt ?? 0,
      messages: conversation,
      shouldTailorCv: requestsTailoredCv(latestUserRequest, Boolean(latestDraft)),
      savedVersions: versions.slice(-5).map((version) => ({
        savedAt: version.savedAt,
        overallAssessment: version.analysis.overallAssessment,
      })),
      applicationId: application._id,
      threadId: thread._id,
      assistantMessageId,
    };
  },
});

export const startStreaming = internalMutation({
  args: {
    userId: v.string(),
    assistantMessageId: v.id("applicationAgentMessages"),
  },
  returns: v.null(),
  handler: async (ctx, { userId, assistantMessageId }) => {
    const message = await ctx.db.get(assistantMessageId);
    if (!message) return null;
    const thread = await getOwnedThread(ctx, userId, message.threadId);
    if (!thread || message.payload.type !== "assistant_pending") return null;
    await ctx.db.patch(message._id, {
      payload: { type: "assistant_streaming", text: "", requestId: message.payload.requestId },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const appendStreamChunk = internalMutation({
  args: {
    userId: v.string(),
    assistantMessageId: v.id("applicationAgentMessages"),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, assistantMessageId, text }) => {
    const message = await ctx.db.get(assistantMessageId);
    if (!message) return null;
    const thread = await getOwnedThread(ctx, userId, message.threadId);
    if (!thread || message.payload.type !== "assistant_streaming") return null;
    await ctx.db.patch(message._id, {
      payload: { type: "assistant_streaming", text, requestId: message.payload.requestId },
      updatedAt: Date.now(),
    });
    await ctx.db.patch(thread._id, { updatedAt: Date.now() });
    return null;
  },
});

export const completeResponse = internalMutation({
  args: {
    userId: v.string(),
    assistantMessageId: v.id("applicationAgentMessages"),
    text: v.string(),
    artifact: v.optional(tailoredCvArtifactValidator),
    applicationId: v.id("applications"),
    threadId: v.id("applicationAgentThreads"),
    jobDescriptionSnapshot: v.string(),
    sourceProfileUpdatedAt: v.number(),
    metadata: v.optional(applicationAgentMessageMetadataValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.assistantMessageId);
    const thread = await getOwnedThread(ctx, args.userId, args.threadId);
    if (
      !message ||
      !thread ||
      message.threadId !== thread._id ||
      thread.applicationId !== args.applicationId ||
      !isPendingAssistantPayload(message.payload.type)
    ) {
      throw new Error("Pending message not found");
    }
    const now = Date.now();
    await ctx.db.patch(message._id, {
      payload: { type: "assistant_complete", text: args.text.trim().slice(0, 30_000) },
      ...(args.metadata ? { metadata: args.metadata } : {}),
      updatedAt: now,
    });
    if (args.artifact) {
      await ctx.db.insert("tailoredCvDrafts", {
        userId: args.userId,
        applicationId: args.applicationId,
        threadId: thread._id,
        sourceAssistantMessageId: message._id,
        artifact: args.artifact,
        jobDescriptionSnapshot: args.jobDescriptionSnapshot,
        sourceProfileUpdatedAt: args.sourceProfileUpdatedAt,
        createdAt: now,
      });
    }
    await ctx.db.patch(thread._id, { updatedAt: now });
    return null;
  },
});

export const failResponse = internalMutation({
  args: {
    userId: v.string(),
    assistantMessageId: v.id("applicationAgentMessages"),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { userId, assistantMessageId, error }) => {
    const message = await ctx.db.get(assistantMessageId);
    if (!message) return null;
    const thread = await getOwnedThread(ctx, userId, message.threadId);
    if (!thread || !isPendingAssistantPayload(message.payload.type))
      return null;
    const now = Date.now();
    await ctx.db.patch(message._id, {
      payload: { type: "assistant_failed", error: error.slice(0, 1_000) },
      updatedAt: now,
    });
    await ctx.db.patch(thread._id, { updatedAt: now });
    return null;
  },
});

async function generateResponse(
  ctx: ActionCtx,
  userId: string,
  assistantMessageId: Id<"applicationAgentMessages">,
  stream = false,
) {
  try {
    const context = await ctx.runQuery(internal.applicationAgent.getGenerationContext, {
      userId,
      assistantMessageId,
    });
    if (!context.profile && context.shouldTailorCv) {
      await ctx.runMutation(internal.applicationAgent.completeResponse, {
        userId,
        assistantMessageId,
        text: "Save your profile before creating a tailored CV.",
        applicationId: context.applicationId,
        threadId: context.threadId,
        jobDescriptionSnapshot: context.application.jobDescription,
        sourceProfileUpdatedAt: context.profileUpdatedAt,
      });
      return;
    }
    if (!context.application.jobDescription && context.shouldTailorCv) {
      await ctx.runMutation(internal.applicationAgent.completeResponse, {
        userId,
        assistantMessageId,
        text: "Add a job description to this application before creating a tailored CV.",
        applicationId: context.applicationId,
        threadId: context.threadId,
        jobDescriptionSnapshot: "",
        sourceProfileUpdatedAt: context.profileUpdatedAt,
      });
      return;
    }

    if (stream) {
      await ctx.runMutation(internal.applicationAgent.startStreaming, {
        userId,
        assistantMessageId,
      });
    }

    let lastFlushTime = Date.now();

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const llm = yield* LlmService;
        if (stream) {
          const response = yield* llm.streamApplicationAgentResponse(
            {
              application: context.application,
              profile: context.profile,
              profileUpdatedAt: context.profileUpdatedAt,
              messages: context.messages,
              shouldTailorCv: context.shouldTailorCv,
              savedVersions: context.savedVersions,
            },
            async (text) => {
              const now = Date.now();
              if (now - lastFlushTime > 150) {
                try {
                  await ctx.runMutation(internal.applicationAgent.appendStreamChunk, {
                    userId,
                    assistantMessageId,
                    text,
                  });
                } catch {
                  // Ignore chunk write errors
                }
                lastFlushTime = now;
              }
            },
          );

          return response;
        }

        return yield* llm.generateApplicationAgentResponse({
          application: context.application,
          profile: context.profile,
          profileUpdatedAt: context.profileUpdatedAt,
          messages: context.messages,
          shouldTailorCv: context.shouldTailorCv,
          savedVersions: context.savedVersions,
        });
      }).pipe(Effect.provide(LlmServiceLive)),
    );

    if (stream) {
      try {
        await ctx.runMutation(internal.applicationAgent.appendStreamChunk, {
          userId,
          assistantMessageId,
          text: result.response,
        });
      } catch {
        // Ignore
      }
    }
    await ctx.runMutation(internal.applicationAgent.completeResponse, {
      userId,
      assistantMessageId,
      text: result.response,
      ...(result.tailoredCv ? { artifact: result.tailoredCv } : {}),
      metadata: result.metadata,
      applicationId: context.applicationId,
      threadId: context.threadId,
      jobDescriptionSnapshot: context.application.jobDescription,
      sourceProfileUpdatedAt: context.profileUpdatedAt,
    });
  } catch (cause) {
    await ctx.runMutation(internal.applicationAgent.failResponse, {
      userId,
      assistantMessageId,
      error: cause instanceof Error ? cause.message : "Agent request failed",
    });
    throw cause;
  }
}

async function getOwnedApplication(ctx: QueryCtx | MutationCtx, userId: string, id: string) {
  const applicationId = ctx.db.normalizeId("applications", id);
  if (!applicationId) return null;
  const application = await ctx.db.get(applicationId);
  return application?.userId === userId ? application : null;
}

async function getOwnedThread(ctx: QueryCtx | MutationCtx, userId: string, id: string) {
  const threadId = ctx.db.normalizeId("applicationAgentThreads", id);
  if (!threadId) return null;
  const thread = await ctx.db.get(threadId);
  return thread?.userId === userId && thread.deletedAt === undefined ? thread : null;
}

async function assertNoPendingResponse(ctx: MutationCtx, threadId: Id<"applicationAgentThreads">) {
  const messages = await ctx.db
    .query("applicationAgentMessages")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .collect();
  if (
    messages.some(
      (message) =>
        message.payload.type === "assistant_pending" ||
        message.payload.type === "assistant_streaming",
    )
  ) {
    throw new Error("Wait for the current response");
  }
}

function titleFromMessage(text: string): string {
  const firstLine = text.split("\n")[0]?.trim() ?? "New chat";
  return firstLine.slice(0, MAX_TITLE_LENGTH);
}

function messageRole(type: "user" | "assistant_complete"): "user" | "assistant" {
  return type === "user" ? "user" : "assistant";
}

function isPendingAssistantPayload(type: Doc<"applicationAgentMessages">["payload"]["type"]) {
  return type === "assistant_pending" || type === "assistant_streaming";
}

function requestsTailoredCv(text: string, hasDraft = false): boolean {
  const explicitRequest =
    /\b(?:cv|resume)\b/i.test(text) &&
    /\b(?:tailor|rewrite|optimi[sz]e|create|match|edit|update|change)\b/i.test(text);
  if (explicitRequest) return true;
  if (!hasDraft) return false;

  const editAction =
    /\b(?:add|apply|change|edit|include|insert|mention|remove|reorder|replace|rewrite|tighten|update|use)\b/i;
  const cvTarget =
    /\b(?:bullet|contact|draft|education|experience|keyword|preview|profile|skill|summary|task|wording)\b/i;
  return editAction.test(text) && cvTarget.test(text);
}
