import { v } from "convex/values";
import { Effect } from "effect";

import type { Id } from "./_generated/dataModel.d.ts";
import { action, mutation, query, type MutationCtx } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { applicationStatusValidator, normalize } from "./lib/domain";
import { LlmService, LlmServiceLive } from "./lib/services";
import { workflowStateFromLegacy } from "./lib/workflowDomain";

const applicationInput = {
  companyName: v.string(),
  companyWebsite: v.optional(v.string()),
  sourceUrl: v.optional(v.string()),
  jobDescription: v.optional(v.string()),
  position: v.string(),
  status: applicationStatusValidator,
  appliedOn: v.optional(v.number()),
};

const jobPostingPreview = v.object({
  companyName: v.string(),
  companyWebsite: v.string(),
  sourceUrl: v.string(),
  position: v.string(),
  jobDescription: v.string(),
  status: applicationStatusValidator,
  appliedOn: v.string(),
});

const batchRolePreview = v.object({
  companyName: v.string(),
  companyWebsite: v.string(),
  sourceUrl: v.string(),
  position: v.string(),
  jobDescription: v.string(),
  parseConfidence: v.number(),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const [companyRows, fitRows] = await Promise.all([
      Promise.all(applications.map((application) => ctx.db.get(application.companyId))),
      Promise.all(
        applications.map((application) =>
          ctx.db
            .query("fitAssessments")
            .withIndex("by_application", (q) => q.eq("applicationId", application._id))
            .order("desc")
            .first(),
        ),
      ),
    ]);
    const companies = new Map(
      companyRows.flatMap((company) => (company ? [[company._id, company]] : [])),
    );
    const fits = new Map(
      fitRows.flatMap((fit) => (fit ? [[fit.applicationId, fit.assessment]] : [])),
    );
    return applications
      .map((application) => {
        const company = companies.get(application.companyId);
        const fit = fits.get(application._id);
        const workflow = workflowStateFromLegacy(application.status);
        return {
          id: application._id,
          company: company?.name ?? "Unknown",
          companyLogo: company?.logo ?? "",
          position: application.position,
          status: application.status,
          preparationStatus: application.preparationStatus ?? workflow.preparationStatus,
          hiringStatus: application.hiringStatus ?? workflow.hiringStatus,
          fitDecision: fit?.decision,
          fitBand: fit?.scoreBand,
          eligibility: fit?.eligibility,
          appliedOn: application.appliedOn,
          lastUpdate: application.lastUpdate,
        };
      })
      .sort((left, right) => right.lastUpdate - left.lastUpdate);
  },
});

export const get = query({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const userId = await requireUserId(ctx);
    const normalizedApplicationId = ctx.db.normalizeId("applications", applicationId);
    if (!normalizedApplicationId) return null;
    const application = await ctx.db.get(normalizedApplicationId);
    if (!application || application.userId !== userId) return null;
    const [company, events] = await Promise.all([
      ctx.db.get(application.companyId),
      ctx.db
        .query("applicationEvents")
        .withIndex("by_application", (q) => q.eq("applicationId", normalizedApplicationId))
        .collect(),
    ]);
    const workflow = workflowStateFromLegacy(application.status);
    return {
      id: application._id,
      position: application.position,
      status: application.status,
      preparationStatus: application.preparationStatus ?? workflow.preparationStatus,
      hiringStatus: application.hiringStatus ?? workflow.hiringStatus,
      archiveReason: application.archiveReason ?? "",
      appliedOn: application.appliedOn,
      lastUpdate: application.lastUpdate,
      sourceUrl: application.sourceUrl,
      jobDescription: application.jobDescription,
      company,
      events: events.slice().sort((left, right) => right.date - left.date),
    };
  },
});

export const previewFromUrl = action({
  args: { sourceUrl: v.optional(v.string()), rawText: v.optional(v.string()) },
  returns: jobPostingPreview,
  handler: async (ctx, { sourceUrl, rawText }) => {
    await requireUserId(ctx);
    const normalizedUrl = sanitizeOptionalUrl(sourceUrl, "Job URL");
    const trimmedRawText = rawText?.trim() ?? "";
    if (!normalizedUrl && !trimmedRawText) throw new Error("Job URL or job text is required");
    const today = formatDateInput(Date.now());
    const preview = await Effect.runPromise(
      Effect.gen(function* () {
        const llm = yield* LlmService;
        return yield* llm.extractJobPostingFromUrl(normalizedUrl, trimmedRawText, today);
      }).pipe(Effect.provide(LlmServiceLive)),
    );
    return {
      companyName: preview.companyName,
      companyWebsite: sanitizePreviewUrl(preview.companyWebsite),
      sourceUrl: normalizedUrl ?? "",
      position: preview.position,
      jobDescription: preview.jobDescription,
      status: preview.status,
      appliedOn: isDateInputValue(preview.appliedOn) ? preview.appliedOn : "",
    };
  },
});

export const previewBatch = action({
  args: { rawText: v.string() },
  returns: v.array(batchRolePreview),
  handler: async (ctx, { rawText }) => {
    await requireUserId(ctx);
    const trimmed = rawText.trim();
    if (!trimmed) throw new Error("Paste one or more job postings");
    if (trimmed.length > 60_000) throw new Error("Pasted role list is too long");
    const roles = await Effect.runPromise(
      Effect.gen(function* () {
        const llm = yield* LlmService;
        return yield* llm.extractBatchJobPostings(trimmed, formatDateInput(Date.now()));
      }).pipe(Effect.provide(LlmServiceLive)),
    );
    return roles.map((role) => ({
      companyName: role.companyName,
      companyWebsite: sanitizePreviewUrl(role.companyWebsite),
      sourceUrl: sanitizePreviewUrl(role.sourceUrl),
      position: role.position,
      jobDescription: role.jobDescription,
      parseConfidence: role.parseConfidence,
    }));
  },
});

export const createBatch = mutation({
  args: { rawText: v.string(), roles: v.array(batchRolePreview) },
  returns: v.object({
    applicationIds: v.array(v.id("applications")),
    createdCount: v.number(),
    duplicateCount: v.number(),
  }),
  handler: async (ctx, { rawText, roles }) => {
    const userId = await requireUserId(ctx);
    if (roles.length === 0 || roles.length > 50) throw new Error("Select 1 to 50 roles");
    const now = Date.now();
    const importRunId = await ctx.db.insert("importRuns", {
      userId,
      mode: "batch",
      status: "processing",
      rawSnapshot: rawText.trim().slice(0, 60_000),
      discoveredRoleCount: roles.length,
      createdAt: now,
      updatedAt: now,
    });
    const applicationIds: Id<"applications">[] = [];
    let createdCount = 0;
    let duplicateCount = 0;
    for (const role of roles) {
      const companyName = role.companyName.trim();
      const position = role.position.trim();
      const normalizedCompanyName = normalize(companyName);
      const normalizedPosition = normalize(position);
      if (!normalizedCompanyName || !normalizedPosition) continue;
      const companyId = await findOrCreateCompany(ctx, {
        name: companyName,
        normalizedName: normalizedCompanyName,
        website: sanitizeOptionalUrl(role.companyWebsite, "Company website") ?? "",
      });
      const existing = await ctx.db
        .query("applications")
        .withIndex("by_user_company_position", (q) =>
          q
            .eq("userId", userId)
            .eq("companyId", companyId)
            .eq("normalizedPosition", normalizedPosition),
        )
        .unique();
      const alias = existing
        ? null
        : await ctx.db
            .query("applicationAliases")
            .withIndex("by_user_company_position", (q) =>
              q
                .eq("userId", userId)
                .eq("companyId", companyId)
                .eq("normalizedPosition", normalizedPosition),
            )
            .unique();
      const existingId = existing?._id ?? alias?.applicationId;
      const sourceUrl = sanitizeOptionalUrl(role.sourceUrl, "Job URL");
      const jobDescription = sanitizeOptionalText(role.jobDescription);
      let applicationId: Id<"applications">;
      if (existingId) {
        duplicateCount += 1;
        applicationId = existingId;
        const currentApplication = existing ?? (await ctx.db.get(existingId));
        await ctx.db.patch(applicationId, {
          sourceUrl: sourceUrl ?? currentApplication?.sourceUrl,
          jobDescription: jobDescription ?? currentApplication?.jobDescription,
          lastUpdate: now,
        });
      } else {
        createdCount += 1;
        applicationId = await ctx.db.insert("applications", {
          userId,
          companyId,
          normalizedPosition,
          position,
          status: "Saved",
          ...workflowStateFromLegacy("Saved"),
          lastUpdate: now,
          sourceUrl,
          jobDescription,
        });
      }
      applicationIds.push(applicationId);
      await ctx.db.insert("jobSources", {
        userId,
        applicationId,
        importRunId,
        sourceType: sourceUrl ? "url" : "text",
        sourceUrl,
        rawSnapshot: [
          `Company: ${companyName}`,
          `Position: ${position}`,
          sourceUrl ? `URL: ${sourceUrl}` : "",
          jobDescription ?? "",
        ]
          .filter(Boolean)
          .join("\n\n")
          .slice(0, 60_000),
        fetchedAt: now,
      });
    }
    await ctx.db.patch(importRunId, {
      status: "complete",
      discoveredRoleCount: applicationIds.length,
      updatedAt: Date.now(),
    });
    return {
      applicationIds: [...new Set(applicationIds)],
      createdCount,
      duplicateCount,
    };
  },
});

export const create = mutation({
  args: applicationInput,
  returns: v.id("applications"),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const companyName = args.companyName.trim();
    const position = args.position.trim();
    const normalizedCompanyName = normalize(companyName);
    const normalizedPosition = normalize(position);
    if (!normalizedCompanyName) throw new Error("Company is required");
    if (!normalizedPosition) throw new Error("Position is required");
    validateAppliedOn(args.appliedOn);

    const companyId = await findOrCreateCompany(ctx, {
      name: companyName,
      normalizedName: normalizedCompanyName,
      website: sanitizeOptionalUrl(args.companyWebsite, "Company website") ?? "",
    });
    const sourceUrl = sanitizeOptionalUrl(args.sourceUrl, "Job URL");
    const existing = await ctx.db
      .query("applications")
      .withIndex("by_user_company_position", (q) =>
        q
          .eq("userId", userId)
          .eq("companyId", companyId)
          .eq("normalizedPosition", normalizedPosition),
      )
      .unique();
    const alias = existing
      ? null
      : await ctx.db
          .query("applicationAliases")
          .withIndex("by_user_company_position", (q) =>
            q
              .eq("userId", userId)
              .eq("companyId", companyId)
              .eq("normalizedPosition", normalizedPosition),
          )
          .unique();
    const values = {
      userId,
      companyId,
      normalizedPosition,
      position,
      status: args.status,
      appliedOn: args.appliedOn,
      lastUpdate: Date.now(),
      sourceUrl,
      jobDescription: sanitizeOptionalText(args.jobDescription),
    };
    const applicationId = existing?._id ?? alias?.applicationId;
    if (applicationId) {
      const currentApplication = existing ?? (await ctx.db.get(applicationId));
      await ctx.db.patch(applicationId, {
        ...values,
        status: currentApplication?.status ?? args.status,
        appliedOn: currentApplication?.appliedOn ?? args.appliedOn,
      });
    } else {
      const createdId = await ctx.db.insert("applications", {
        ...values,
        ...workflowStateFromLegacy(args.status),
      });
      await recordJobSource(ctx, userId, createdId, {
        sourceUrl,
        jobDescription: values.jobDescription,
        companyName,
        position,
      });
      return createdId;
    }
    await recordJobSource(ctx, userId, applicationId, {
      sourceUrl,
      jobDescription: values.jobDescription,
      companyName,
      position,
    });
    return applicationId;
  },
});

export const addEvent = mutation({
  args: {
    applicationId: v.string(),
    type: applicationStatusValidator,
    date: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { applicationId, type, date, note }) => {
    const userId = await requireUserId(ctx);
    const normalizedApplicationId = ctx.db.normalizeId("applications", applicationId);
    if (!normalizedApplicationId) throw new Error("Application not found");
    const application = await ctx.db.get(normalizedApplicationId);
    if (!application || application.userId !== userId) throw new Error("Application not found");
    if (!Number.isFinite(date)) throw new Error("Invalid date");

    await ctx.db.insert("applicationEvents", {
      applicationId: normalizedApplicationId,
      sourceEmailId: `manual:${crypto.randomUUID()}`,
      type,
      date,
      note: sanitizeOptionalText(note) ?? "",
    });
    await syncApplicationFromEvents(ctx, normalizedApplicationId);
  },
});

export const update = mutation({
  args: {
    applicationId: v.string(),
    position: v.string(),
    status: applicationStatusValidator,
    appliedOn: v.optional(v.number()),
    sourceUrl: v.optional(v.string()),
    jobDescription: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { applicationId, position, status, appliedOn, sourceUrl, jobDescription },
  ) => {
    const userId = await requireUserId(ctx);
    const normalizedApplicationId = ctx.db.normalizeId("applications", applicationId);
    if (!normalizedApplicationId) throw new Error("Application not found");
    const application = await ctx.db.get(normalizedApplicationId);
    if (!application || application.userId !== userId) throw new Error("Application not found");
    const normalizedPosition = normalize(position);
    if (!normalizedPosition) throw new Error("Position is required");
    validateAppliedOn(appliedOn);
    await ctx.db.patch(normalizedApplicationId, {
      normalizedPosition,
      position: position.trim(),
      status,
      ...workflowStateFromLegacy(status),
      appliedOn,
      sourceUrl: sanitizeOptionalUrl(sourceUrl, "Job URL"),
      jobDescription: sanitizeOptionalText(jobDescription),
    });
    if (sourceUrl !== application.sourceUrl || jobDescription !== application.jobDescription) {
      const company = await ctx.db.get(application.companyId);
      await recordJobSource(ctx, userId, normalizedApplicationId, {
        sourceUrl: sanitizeOptionalUrl(sourceUrl, "Job URL"),
        jobDescription: sanitizeOptionalText(jobDescription),
        companyName: company?.name ?? "Unknown",
        position: position.trim(),
      });
    }
  },
});

export const remove = mutation({
  args: { applicationId: v.string() },
  handler: async (ctx, { applicationId }) => {
    const userId = await requireUserId(ctx);
    const normalizedApplicationId = ctx.db.normalizeId("applications", applicationId);
    if (!normalizedApplicationId) throw new Error("Application not found");
    const application = await ctx.db.get(normalizedApplicationId);
    if (!application || application.userId !== userId) throw new Error("Application not found");
    await deleteApplication(ctx, normalizedApplicationId);
  },
});

export const updateStatus = mutation({
  args: {
    applicationIds: v.array(v.string()),
    status: applicationStatusValidator,
  },
  handler: async (ctx, { applicationIds, status }) => {
    const userId = await requireUserId(ctx);
    const applications = await getOwnedApplications(ctx, userId, applicationIds);
    await Promise.all(
      applications.map((application) =>
        ctx.db.patch(application._id, { status, ...workflowStateFromLegacy(status) }),
      ),
    );
  },
});

export const removeMany = mutation({
  args: { applicationIds: v.array(v.string()) },
  handler: async (ctx, { applicationIds }) => {
    const userId = await requireUserId(ctx);
    const applications = await getOwnedApplications(ctx, userId, applicationIds);
    for (const application of applications) {
      await deleteApplication(ctx, application._id);
    }
  },
});

export const merge = mutation({
  args: {
    targetApplicationId: v.string(),
    sourceApplicationIds: v.array(v.string()),
  },
  handler: async (ctx, { targetApplicationId, sourceApplicationIds }) => {
    const userId = await requireUserId(ctx);
    const targetId = ctx.db.normalizeId("applications", targetApplicationId);
    if (!targetId) throw new Error("Target application not found");
    const target = await ctx.db.get(targetId);
    if (!target || target.userId !== userId) throw new Error("Target application not found");

    const sourceIds = [
      ...new Set(
        sourceApplicationIds.flatMap((applicationId) => {
          const sourceId = ctx.db.normalizeId("applications", applicationId);
          return sourceId && sourceId !== targetId ? [sourceId] : [];
        }),
      ),
    ];
    if (sourceIds.length === 0) throw new Error("Select applications to merge");

    const sources = await Promise.all(sourceIds.map((sourceId) => ctx.db.get(sourceId)));
    if (sources.some((source) => !source || source.userId !== userId)) {
      throw new Error("Source application not found");
    }

    for (const source of sources) {
      if (!source) continue;
      await saveAlias(ctx, {
        userId,
        companyId: source.companyId,
        normalizedPosition: source.normalizedPosition,
        applicationId: targetId,
      });
      const aliases = await ctx.db
        .query("applicationAliases")
        .withIndex("by_application", (q) => q.eq("applicationId", source._id))
        .collect();
      for (const alias of aliases) {
        await ctx.db.patch(alias._id, { applicationId: targetId });
      }
      const events = await ctx.db
        .query("applicationEvents")
        .withIndex("by_application", (q) => q.eq("applicationId", source._id))
        .collect();
      for (const event of events) {
        const duplicate = await ctx.db
          .query("applicationEvents")
          .withIndex("by_application_source_type_date", (q) =>
            q
              .eq("applicationId", targetId)
              .eq("sourceEmailId", event.sourceEmailId)
              .eq("type", event.type)
              .eq("date", event.date),
          )
          .unique();
        if (duplicate) {
          await ctx.db.delete(event._id);
        } else {
          await ctx.db.patch(event._id, { applicationId: targetId });
        }
      }
      await reassignApplicationAgentData(ctx, source._id, targetId);
      await ctx.db.delete(source._id);
    }

    const events = await ctx.db
      .query("applicationEvents")
      .withIndex("by_application", (q) => q.eq("applicationId", targetId))
      .collect();
    const orderedEvents = events.slice().sort((left, right) => left.date - right.date);
    const firstEvent = orderedEvents[0];
    const lastEvent = orderedEvents[orderedEvents.length - 1];
    if (firstEvent && lastEvent) {
      await ctx.db.patch(targetId, {
        status: lastEvent.type,
        ...workflowStateFromLegacy(lastEvent.type),
        appliedOn: orderedEvents.find((event) => event.type === "Applied")?.date ?? firstEvent.date,
        lastUpdate: lastEvent.date,
      });
    } else {
      const applications = [target, ...sources].filter((application) => application !== null);
      const latestApplication = applications.reduce((latest, application) =>
        application.lastUpdate > latest.lastUpdate ? application : latest,
      );
      const appliedDates = applications.flatMap((application) =>
        application.appliedOn === undefined ? [] : [application.appliedOn],
      );
      await ctx.db.patch(targetId, {
        status: latestApplication.status,
        ...workflowStateFromLegacy(latestApplication.status),
        appliedOn: appliedDates.length > 0 ? Math.min(...appliedDates) : undefined,
        lastUpdate: latestApplication.lastUpdate,
      });
    }
  },
});

async function saveAlias(
  ctx: MutationCtx,
  alias: {
    userId: string;
    companyId: Id<"companies">;
    normalizedPosition: string;
    applicationId: Id<"applications">;
  },
) {
  const existing = await ctx.db
    .query("applicationAliases")
    .withIndex("by_user_company_position", (q) =>
      q
        .eq("userId", alias.userId)
        .eq("companyId", alias.companyId)
        .eq("normalizedPosition", alias.normalizedPosition),
    )
    .unique();
  if (existing) {
    if (existing.applicationId !== alias.applicationId) {
      await ctx.db.patch(existing._id, { applicationId: alias.applicationId });
    }
    return;
  }
  await ctx.db.insert("applicationAliases", alias);
}

async function findOrCreateCompany(
  ctx: MutationCtx,
  company: { name: string; normalizedName: string; website: string },
): Promise<Id<"companies">> {
  const existing = await ctx.db
    .query("companies")
    .withIndex("by_normalized_name", (q) => q.eq("normalizedName", company.normalizedName))
    .unique();
  if (existing) {
    if (company.website && !existing.website) {
      await ctx.db.patch(existing._id, { website: company.website });
    }
    return existing._id;
  }
  return await ctx.db.insert("companies", {
    normalizedName: company.normalizedName,
    name: company.name,
    summary: "",
    industry: "Unknown",
    hqLocation: "Unknown",
    size: "Unknown",
    logo: "",
    website: company.website,
    socials: {},
    enrichedAt: Date.now(),
  });
}

function sanitizeOptionalUrl(value: string | undefined, label: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    // Throw below for a consistent message.
  }
  throw new Error(`${label} must be a valid http or https URL`);
}

function sanitizePreviewUrl(value: string): string {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function sanitizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 30_000) : undefined;
}

function validateAppliedOn(appliedOn: number | undefined) {
  if (appliedOn !== undefined && !Number.isFinite(appliedOn))
    throw new Error("Invalid applied date");
}

function formatDateInput(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function isDateInputValue(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00`));
}

async function getOwnedApplications(ctx: MutationCtx, userId: string, applicationIds: string[]) {
  const ids = [
    ...new Set(
      applicationIds.flatMap((applicationId) => {
        const id = ctx.db.normalizeId("applications", applicationId);
        return id ? [id] : [];
      }),
    ),
  ];
  if (ids.length === 0) throw new Error("Select applications");
  const applications = await Promise.all(ids.map((id) => ctx.db.get(id)));
  if (applications.some((application) => !application || application.userId !== userId)) {
    throw new Error("Application not found");
  }
  return applications.flatMap((application) => (application ? [application] : []));
}

async function syncApplicationFromEvents(ctx: MutationCtx, applicationId: Id<"applications">) {
  const events = await ctx.db
    .query("applicationEvents")
    .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
    .collect();
  if (events.length === 0) return;
  const orderedEvents = events.slice().sort((left, right) => left.date - right.date);
  const firstEvent = orderedEvents[0];
  const lastEvent = orderedEvents[orderedEvents.length - 1];
  if (!firstEvent || !lastEvent) return;
  await ctx.db.patch(applicationId, {
    status: lastEvent.type,
    ...workflowStateFromLegacy(lastEvent.type),
    appliedOn: orderedEvents.find((event) => event.type === "Applied")?.date ?? firstEvent.date,
    lastUpdate: lastEvent.date,
  });
}

async function deleteApplication(ctx: MutationCtx, applicationId: Id<"applications">) {
  const [events, aliases, threads, drafts, versions, sources, briefs, fits, artifacts, tasks] =
    await Promise.all([
    ctx.db
      .query("applicationEvents")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("applicationAliases")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("applicationAgentThreads")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("tailoredCvDrafts")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("tailoredCvVersions")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("jobSources")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("jobBriefs")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("fitAssessments")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("applicationArtifacts")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
    ctx.db
      .query("applicationTasks")
      .withIndex("by_application", (q) => q.eq("applicationId", applicationId))
      .collect(),
  ]);
  const messages = (
    await Promise.all(
      threads.map((thread) =>
        ctx.db
          .query("applicationAgentMessages")
          .withIndex("by_thread", (q) => q.eq("threadId", thread._id))
          .collect(),
      ),
    )
  ).flat();
  await Promise.all([
    ...events.map((event) => ctx.db.delete(event._id)),
    ...aliases.map((alias) => ctx.db.delete(alias._id)),
    ...messages.map((message) => ctx.db.delete(message._id)),
    ...versions.map((version) => ctx.db.delete(version._id)),
    ...drafts.map((draft) => ctx.db.delete(draft._id)),
    ...threads.map((thread) => ctx.db.delete(thread._id)),
    ...sources.map((source) => ctx.db.delete(source._id)),
    ...briefs.map((brief) => ctx.db.delete(brief._id)),
    ...fits.map((fit) => ctx.db.delete(fit._id)),
    ...artifacts.map((artifact) => ctx.db.delete(artifact._id)),
    ...tasks.map((task) => ctx.db.delete(task._id)),
  ]);
  const importRunIds = [
    ...new Set(sources.flatMap((source) => (source.importRunId ? [source.importRunId] : []))),
  ];
  for (const importRunId of importRunIds) {
    const remainingSources = await ctx.db
      .query("jobSources")
      .withIndex("by_import_run", (q) => q.eq("importRunId", importRunId))
      .collect();
    if (remainingSources.length === 0) await ctx.db.delete(importRunId);
  }
  await ctx.db.delete(applicationId);
}

async function reassignApplicationAgentData(
  ctx: MutationCtx,
  sourceApplicationId: Id<"applications">,
  targetApplicationId: Id<"applications">,
) {
  const [threads, drafts, versions, sources, sourceBrief, targetBrief, fits, artifacts, tasks] =
    await Promise.all([
    ctx.db
      .query("applicationAgentThreads")
      .withIndex("by_application", (q) => q.eq("applicationId", sourceApplicationId))
      .collect(),
    ctx.db
      .query("tailoredCvDrafts")
      .withIndex("by_application", (q) => q.eq("applicationId", sourceApplicationId))
      .collect(),
    ctx.db
      .query("tailoredCvVersions")
      .withIndex("by_application", (q) => q.eq("applicationId", sourceApplicationId))
      .collect(),
    ctx.db
      .query("jobSources")
      .withIndex("by_application", (q) => q.eq("applicationId", sourceApplicationId))
      .collect(),
    ctx.db
      .query("jobBriefs")
      .withIndex("by_application", (q) => q.eq("applicationId", sourceApplicationId))
      .unique(),
    ctx.db
      .query("jobBriefs")
      .withIndex("by_application", (q) => q.eq("applicationId", targetApplicationId))
      .unique(),
    ctx.db
      .query("fitAssessments")
      .withIndex("by_application", (q) => q.eq("applicationId", sourceApplicationId))
      .collect(),
    ctx.db
      .query("applicationArtifacts")
      .withIndex("by_application", (q) => q.eq("applicationId", sourceApplicationId))
      .collect(),
    ctx.db
      .query("applicationTasks")
      .withIndex("by_application", (q) => q.eq("applicationId", sourceApplicationId))
      .collect(),
  ]);
  await Promise.all([
    ...threads.map((thread) => ctx.db.patch(thread._id, { applicationId: targetApplicationId })),
    ...drafts.map((draft) => ctx.db.patch(draft._id, { applicationId: targetApplicationId })),
    ...versions.map((version) => ctx.db.patch(version._id, { applicationId: targetApplicationId })),
    ...sources.map((source) => ctx.db.patch(source._id, { applicationId: targetApplicationId })),
    ...fits.map((fit) => ctx.db.patch(fit._id, { applicationId: targetApplicationId })),
    ...artifacts.map((artifact) =>
      ctx.db.patch(artifact._id, { applicationId: targetApplicationId }),
    ),
    ...tasks.map((task) => ctx.db.patch(task._id, { applicationId: targetApplicationId })),
    ...(sourceBrief
      ? [
          targetBrief
            ? ctx.db.delete(sourceBrief._id)
            : ctx.db.patch(sourceBrief._id, { applicationId: targetApplicationId }),
        ]
      : []),
  ]);
}

async function recordJobSource(
  ctx: MutationCtx,
  userId: string,
  applicationId: Id<"applications">,
  source: {
    sourceUrl: string | undefined;
    jobDescription: string | undefined;
    companyName: string;
    position: string;
  },
) {
  const now = Date.now();
  const rawSnapshot = [
    `Company: ${source.companyName}`,
    `Position: ${source.position}`,
    source.sourceUrl ? `URL: ${source.sourceUrl}` : "",
    source.jobDescription ?? "",
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 60_000);
  const importRunId = await ctx.db.insert("importRuns", {
    userId,
    mode: "single",
    status: "complete",
    rawSnapshot,
    discoveredRoleCount: 1,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("jobSources", {
    userId,
    applicationId,
    importRunId,
    sourceType: source.sourceUrl ? "url" : source.jobDescription ? "text" : "manual",
    sourceUrl: source.sourceUrl,
    rawSnapshot,
    fetchedAt: now,
  });
}
