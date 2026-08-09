import { Effect } from "effect"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import type { Id } from "./_generated/dataModel"
import { requireUserId } from "./lib/auth"
import { LlmService, LlmServiceLive } from "./lib/services"
import {
  applicationTaskTypeValidator,
  artifactStateValidator,
  artifactTypeValidator,
  canTransitionHiring,
  canTransitionPreparation,
  fitAssessmentValidator,
  hiringStatusValidator,
  jobBriefValidator,
  legacyStatusFromHiring,
  preparationStatusValidator,
  unsupportedNumericClaims,
  workflowStateFromLegacy,
} from "./lib/workflowDomain"

export const get = query({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const userId = await requireUserId(ctx)
    const id = ctx.db.normalizeId("applications", applicationId)
    if (!id) return null
    const application = await ctx.db.get(id)
    if (!application || application.userId !== userId) return null
    const [
      brief,
      fit,
      artifacts,
      legacyCvVersions,
      tasks,
      sources,
      profile,
      evidence,
      rules,
      preferences,
    ] = await Promise.all([
      ctx.db
        .query("jobBriefs")
        .withIndex("by_application", (q) => q.eq("applicationId", id))
        .unique(),
      ctx.db
        .query("fitAssessments")
        .withIndex("by_application", (q) => q.eq("applicationId", id))
        .order("desc")
        .first(),
      ctx.db
        .query("applicationArtifacts")
        .withIndex("by_application", (q) => q.eq("applicationId", id))
        .order("desc")
        .collect(),
      ctx.db
        .query("tailoredCvVersions")
        .withIndex("by_application", (q) => q.eq("applicationId", id))
        .collect(),
      ctx.db
        .query("applicationTasks")
        .withIndex("by_application", (q) => q.eq("applicationId", id))
        .collect(),
      ctx.db
        .query("jobSources")
        .withIndex("by_application", (q) => q.eq("applicationId", id))
        .collect(),
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("candidateEvidence")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("candidateRules")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("candidatePreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    ])
    const fallback = workflowStateFromLegacy(application.status)
    const relevantEvidence = evidence.filter(
      (entry) => entry.reusable && entry.verification.state === "verified"
    )
    const activeRules = rules.filter((entry) => entry.active)
    const currentEvidence = new Map(
      relevantEvidence.map((entry) => [entry._id, entry.updatedAt])
    )
    const currentRules = new Map(
      activeRules.map((entry) => [entry._id, entry.updatedAt])
    )
    return {
      preparationStatus:
        application.preparationStatus ?? fallback.preparationStatus,
      hiringStatus: application.hiringStatus ?? fallback.hiringStatus,
      archiveReason: application.archiveReason ?? "",
      brief,
      fit: fit
        ? {
            ...fit,
            stale:
              fit.profileUpdatedAt !== (profile?.updatedAt ?? 0) ||
              fit.evidenceUpdatedAt !== latestUpdatedAt(evidence) ||
              fit.preferencesUpdatedAt !== (preferences?.updatedAt ?? 0) ||
              brief?.jobDescriptionSnapshot !==
                (application.jobDescription ?? ""),
          }
        : null,
      artifacts: artifacts.map((artifact) => {
        const staleReasons = [
          ...(artifact.sourceSnapshot.jobDescription !==
          (application.jobDescription ?? "")
            ? ["Job description changed"]
            : []),
          ...(artifact.sourceSnapshot.profileUpdatedAt !==
          (profile?.updatedAt ?? 0)
            ? ["Profile changed"]
            : []),
          ...(artifact.sourceSnapshot.jobBriefUpdatedAt !==
          (brief?.updatedAt ?? 0)
            ? ["Job brief changed"]
            : []),
          ...(artifact.sourceSnapshot.evidence.some(
            (entry) =>
              currentEvidence.get(entry.id as Id<"candidateEvidence">) !==
              entry.updatedAt
          ) ||
          artifact.sourceSnapshot.evidence.length !== relevantEvidence.length
            ? ["Evidence changed"]
            : []),
          ...(artifact.sourceSnapshot.rules.some(
            (entry) =>
              currentRules.get(entry.id as Id<"candidateRules">) !==
              entry.updatedAt
          ) || artifact.sourceSnapshot.rules.length !== activeRules.length
            ? ["Writing rules changed"]
            : []),
        ]
        return { ...artifact, stale: staleReasons.length > 0, staleReasons }
      }),
      legacyCvVersions: legacyCvVersions
        .sort((left, right) => right.savedAt - left.savedAt)
        .map((version) => ({
          id: version._id,
          savedAt: version.savedAt,
          overallAssessment: version.analysis.overallAssessment,
          stale: version.sourceProfileUpdatedAt !== (profile?.updatedAt ?? 0),
        })),
      tasks: tasks.sort((left, right) => {
        if (left.completedAt && !right.completedAt) return 1
        if (!left.completedAt && right.completedAt) return -1
        return (
          (left.dueAt ?? Number.MAX_SAFE_INTEGER) -
          (right.dueAt ?? Number.MAX_SAFE_INTEGER)
        )
      }),
      sourceCount: sources.length,
      readiness: {
        profile: Boolean(profile),
        jobBrief: Boolean(brief),
        fitAssessed: Boolean(fit),
        verifiedEvidence: evidence.some(
          (entry) => entry.verification.state === "verified"
        ),
        savedArtifact:
          legacyCvVersions.length > 0 ||
          artifacts.some((artifact) => artifact.state !== "draft"),
        openTasks: tasks.filter((task) => task.completedAt === undefined)
          .length,
      },
    }
  },
})

export const updateState = mutation({
  args: {
    applicationId: v.string(),
    preparationStatus: preparationStatusValidator,
    hiringStatus: hiringStatusValidator,
    archiveReason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const id = ctx.db.normalizeId("applications", args.applicationId)
    if (!id) throw new Error("Application not found")
    const application = await ctx.db.get(id)
    if (!application || application.userId !== userId)
      throw new Error("Application not found")
    const fallback = workflowStateFromLegacy(application.status)
    const fromPreparation =
      application.preparationStatus ?? fallback.preparationStatus
    const fromHiring = application.hiringStatus ?? fallback.hiringStatus
    if (!canTransitionPreparation(fromPreparation, args.preparationStatus)) {
      throw new Error(
        `Preparation cannot move from ${fromPreparation} to ${args.preparationStatus}`
      )
    }
    if (!canTransitionHiring(fromHiring, args.hiringStatus)) {
      throw new Error(
        `Hiring cannot move from ${fromHiring} to ${args.hiringStatus}`
      )
    }
    if (
      args.hiringStatus !== "not_applied" &&
      args.hiringStatus !== "rejected" &&
      args.hiringStatus !== "withdrawn" &&
      args.preparationStatus !== "ready"
    ) {
      throw new Error(
        "An active hiring process requires preparation to be ready"
      )
    }
    if (
      args.preparationStatus === "archived" &&
      !["not_applied", "rejected", "withdrawn"].includes(args.hiringStatus)
    ) {
      throw new Error("An active hiring process cannot be archived")
    }
    const archiveReason = args.archiveReason?.trim()
    if (args.preparationStatus === "archived" && !archiveReason) {
      throw new Error("An archive reason is required")
    }
    await ctx.db.patch(id, {
      preparationStatus: args.preparationStatus,
      hiringStatus: args.hiringStatus,
      status: legacyStatusFromHiring(args.hiringStatus),
      archiveReason:
        args.preparationStatus === "archived" ? archiveReason : undefined,
      lastUpdate: Date.now(),
    })
    return null
  },
})

export const generateFit = action({
  args: { applicationId: v.string() },
  returns: v.null(),
  handler: async (ctx, { applicationId }) => {
    const userId = await requireUserId(ctx)
    const context = await ctx.runQuery(internal.workflow.readFitContext, {
      userId,
      applicationId,
    })
    if (!context) throw new Error("Application not found")
    if (!context.application.jobDescription.trim()) {
      throw new Error("Add a job description before assessing fit")
    }
    const generated = await Effect.runPromise(
      Effect.gen(function* () {
        const llm = yield* LlmService
        return yield* llm.generateFitAssessment(context)
      }).pipe(Effect.provide(LlmServiceLive))
    )
    await ctx.runMutation(internal.workflow.saveGeneratedFit, {
      userId,
      applicationId,
      brief: generated.brief,
      assessment: generated.assessment,
      profileUpdatedAt: context.profileUpdatedAt,
      evidenceUpdatedAt: context.evidenceUpdatedAt,
      preferencesUpdatedAt: context.preferencesUpdatedAt,
    })
    return null
  },
})

export const readFitContext = internalQuery({
  args: { userId: v.string(), applicationId: v.string() },
  handler: async (ctx, { userId, applicationId }) => {
    const id = ctx.db.normalizeId("applications", applicationId)
    if (!id) return null
    const application = await ctx.db.get(id)
    if (!application || application.userId !== userId) return null
    const [company, profile, preferences, evidence] = await Promise.all([
      ctx.db.get(application.companyId),
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("candidatePreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("candidateEvidence")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ])
    return {
      application: {
        position: application.position,
        company: company?.name ?? "Unknown",
        jobDescription: application.jobDescription ?? "",
      },
      profile,
      preferences: preferences?.preferences ?? null,
      evidence: evidence.map((entry) => ({
        id: entry._id,
        claim: entry.claim,
        kind: entry.kind,
        verified: entry.verification.state === "verified",
      })),
      profileUpdatedAt: profile?.updatedAt ?? 0,
      evidenceUpdatedAt: latestUpdatedAt(evidence),
      preferencesUpdatedAt: preferences?.updatedAt ?? 0,
    }
  },
})

export const saveGeneratedFit = internalMutation({
  args: {
    userId: v.string(),
    applicationId: v.string(),
    brief: jobBriefValidator,
    assessment: fitAssessmentValidator,
    profileUpdatedAt: v.number(),
    evidenceUpdatedAt: v.number(),
    preferencesUpdatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const id = ctx.db.normalizeId("applications", args.applicationId)
    if (!id) throw new Error("Application not found")
    const application = await ctx.db.get(id)
    if (!application || application.userId !== args.userId)
      throw new Error("Application not found")
    const now = Date.now()
    const existingBrief = await ctx.db
      .query("jobBriefs")
      .withIndex("by_application", (q) => q.eq("applicationId", id))
      .unique()
    const briefValues = {
      brief: args.brief,
      jobDescriptionSnapshot: application.jobDescription ?? "",
      sourceUpdatedAt: application.lastUpdate,
      updatedAt: now,
    }
    if (existingBrief) {
      await ctx.db.patch(existingBrief._id, briefValues)
    } else {
      await ctx.db.insert("jobBriefs", {
        userId: args.userId,
        applicationId: id,
        ...briefValues,
        createdAt: now,
      })
    }
    await ctx.db.insert("fitAssessments", {
      userId: args.userId,
      applicationId: id,
      assessment: args.assessment,
      jobBriefSnapshot: args.brief,
      profileUpdatedAt: args.profileUpdatedAt,
      evidenceUpdatedAt: args.evidenceUpdatedAt,
      preferencesUpdatedAt: args.preferencesUpdatedAt,
      createdAt: now,
    })
    const currentWorkflow = workflowStateFromLegacy(application.status);
    if (
      (application.preparationStatus ?? currentWorkflow.preparationStatus) === "discovered"
    ) {
      await ctx.db.patch(id, {
        preparationStatus: "qualified",
        lastUpdate: now,
      })
    }
    return null
  },
})

export const saveArtifact = mutation({
  args: {
    applicationId: v.string(),
    artifactId: v.optional(v.string()),
    type: artifactTypeValidator,
    state: artifactStateValidator,
    title: v.string(),
    content: v.string(),
    baselineId: v.optional(v.string()),
  },
  returns: v.id("applicationArtifacts"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const applicationId = ctx.db.normalizeId("applications", args.applicationId)
    if (!applicationId) throw new Error("Application not found")
    const application = await ctx.db.get(applicationId)
    if (!application || application.userId !== userId)
      throw new Error("Application not found")
    const title = args.title.trim()
    const content = args.content.trim()
    if (!title) throw new Error("Artifact title is required")
    if (args.state !== "draft" && !content)
      throw new Error("Saved artifacts need content")
    const [brief, profile, evidence, rules] = await Promise.all([
      ctx.db
        .query("jobBriefs")
        .withIndex("by_application", (q) =>
          q.eq("applicationId", applicationId)
        )
        .unique(),
      ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
      ctx.db
        .query("candidateEvidence")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("candidateRules")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ])
    if (args.state !== "draft") {
      if (!profile) throw new Error("Save your candidate profile before saving an artifact")
      if (!brief) throw new Error("Assess fit and review the job brief before saving an artifact")
      if (args.type !== "interview_prep") {
        const candidateSources = [
          JSON.stringify(profile),
          ...evidence
            .filter((entry) => entry.verification.state === "verified")
            .map((entry) => entry.claim),
        ]
          .join(" ")
          .toLocaleLowerCase()
        const unsupportedMetric = unsupportedNumericClaims(
          content,
          candidateSources
        )[0]
        if (unsupportedMetric) {
          throw new Error(
            `Verify or remove the unsupported numeric claim “${unsupportedMetric}”`
          )
        }
      }
    }
    const baselineId = args.baselineId
      ? ctx.db.normalizeId("candidateCvBaselines", args.baselineId)
      : null
    const baseline = baselineId ? await ctx.db.get(baselineId) : null
    if (baseline && baseline.userId !== userId)
      throw new Error("CV baseline not found")
    const now = Date.now()
    const values = {
      userId,
      applicationId,
      type: args.type,
      state: args.state,
      title: title.slice(0, 160),
      content: content.slice(0, 60_000),
      sourceSnapshot: {
        jobDescription: application.jobDescription ?? "",
        ...(brief ? { jobBrief: brief.brief } : {}),
        jobBriefUpdatedAt: brief?.updatedAt ?? 0,
        ...(profile
          ? {
              profile: {
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
                projects: profile.projects ?? [],
                educations: profile.educations,
              },
            }
          : {}),
        profileUpdatedAt: profile?.updatedAt ?? 0,
        evidence: evidence
          .filter(
            (entry) => entry.reusable && entry.verification.state === "verified"
          )
          .map((entry) => ({
            id: entry._id,
            claim: entry.claim,
            updatedAt: entry.updatedAt,
          })),
        rules: rules
          .filter((entry) => entry.active)
          .map((entry) => ({
            id: entry._id,
            instruction: entry.instruction,
            updatedAt: entry.updatedAt,
          })),
        ...(baseline
          ? {
              baseline: {
                id: baseline._id,
                name: baseline.name,
                updatedAt: baseline.updatedAt,
                profileSnapshot: baseline.profileSnapshot,
              },
            }
          : {}),
        generator: { type: "manual" as const },
      },
      updatedAt: now,
    }
    const id = args.artifactId
      ? ctx.db.normalizeId("applicationArtifacts", args.artifactId)
      : null
    const existing = id ? await ctx.db.get(id) : null
    if (
      existing?.userId === userId &&
      existing.applicationId === applicationId
    ) {
      await ctx.db.patch(existing._id, values)
      return existing._id
    }
    return await ctx.db.insert("applicationArtifacts", {
      ...values,
      createdAt: now,
    })
  },
})

export const removeArtifact = mutation({
  args: { artifactId: v.string() },
  returns: v.null(),
  handler: async (ctx, { artifactId }) => {
    const userId = await requireUserId(ctx)
    const id = ctx.db.normalizeId("applicationArtifacts", artifactId)
    if (!id) throw new Error("Artifact not found")
    const artifact = await ctx.db.get(id)
    if (!artifact || artifact.userId !== userId)
      throw new Error("Artifact not found")
    await ctx.db.delete(id)
    return null
  },
})

export const saveTask = mutation({
  args: {
    applicationId: v.string(),
    taskId: v.optional(v.string()),
    type: applicationTaskTypeValidator,
    title: v.string(),
    dueAt: v.optional(v.number()),
    contact: v.string(),
    note: v.string(),
  },
  returns: v.id("applicationTasks"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const applicationId = ctx.db.normalizeId("applications", args.applicationId)
    if (!applicationId) throw new Error("Application not found")
    const application = await ctx.db.get(applicationId)
    if (!application || application.userId !== userId)
      throw new Error("Application not found")
    const title = args.title.trim()
    if (!title) throw new Error("Task title is required")
    if (args.dueAt !== undefined && !Number.isFinite(args.dueAt))
      throw new Error("Invalid due date")
    const now = Date.now()
    const values = {
      userId,
      applicationId,
      type: args.type,
      title: title.slice(0, 200),
      dueAt: args.dueAt,
      contact: args.contact.trim().slice(0, 300),
      note: args.note.trim().slice(0, 2_000),
      updatedAt: now,
    }
    const id = args.taskId
      ? ctx.db.normalizeId("applicationTasks", args.taskId)
      : null
    const existing = id ? await ctx.db.get(id) : null
    if (
      existing?.userId === userId &&
      existing.applicationId === applicationId
    ) {
      await ctx.db.patch(existing._id, values)
      return existing._id
    }
    return await ctx.db.insert("applicationTasks", {
      ...values,
      createdAt: now,
    })
  },
})

export const setTaskCompleted = mutation({
  args: { taskId: v.string(), completed: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { taskId, completed }) => {
    const userId = await requireUserId(ctx)
    const id = ctx.db.normalizeId("applicationTasks", taskId)
    if (!id) throw new Error("Task not found")
    const task = await ctx.db.get(id)
    if (!task || task.userId !== userId) throw new Error("Task not found")
    await ctx.db.patch(id, {
      completedAt: completed ? Date.now() : undefined,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const removeTask = mutation({
  args: { taskId: v.string() },
  returns: v.null(),
  handler: async (ctx, { taskId }) => {
    const userId = await requireUserId(ctx)
    const id = ctx.db.normalizeId("applicationTasks", taskId)
    if (!id) throw new Error("Task not found")
    const task = await ctx.db.get(id)
    if (!task || task.userId !== userId) throw new Error("Task not found")
    await ctx.db.delete(id)
    return null
  },
})

function latestUpdatedAt(entries: Array<{ updatedAt: number }>): number {
  return entries.reduce((latest, entry) => Math.max(latest, entry.updatedAt), 0)
}
