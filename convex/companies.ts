import { Effect } from "effect"
import { v } from "convex/values"

import { api } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { action, mutation, query, type MutationCtx } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import { normalize, socialsSchema } from "./lib/domain"
import {
  CompanyEnrichmentService,
  CompanyEnrichmentServiceLive,
} from "./lib/services"

const socialsValidator = v.object({
  linkedin: v.optional(v.string()),
  twitter: v.optional(v.string()),
  facebook: v.optional(v.string()),
  instagram: v.optional(v.string()),
  youtube: v.optional(v.string()),
  github: v.optional(v.string()),
})

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const companies = await ctx.db.query("companies").collect()
    const applications = await ctx.db
      .query("applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
    const applicationCounts = new Map<Id<"companies">, number>()
    for (const application of applications) {
      applicationCounts.set(
        application.companyId,
        (applicationCounts.get(application.companyId) ?? 0) + 1
      )
    }
    return companies
      .map((company) => ({
        ...company,
        id: company._id,
        banner: company.banner ?? "",
        brandColor: company.brandColor ?? "",
        applicationCount: applicationCounts.get(company._id) ?? 0,
      }))
      .sort((left, right) => left.name.localeCompare(right.name))
  },
})

export const update = mutation({
  args: {
    companyId: v.string(),
    name: v.optional(v.string()),
    summary: v.string(),
    industry: v.string(),
    hqLocation: v.string(),
    size: v.string(),
    website: v.string(),
    logo: v.optional(v.string()),
    banner: v.optional(v.string()),
    brandColor: v.optional(v.string()),
    socials: v.optional(socialsValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const companyId = ctx.db.normalizeId("companies", args.companyId)
    if (!companyId) throw new Error("Company not found")
    const company = await ctx.db.get(companyId)
    if (!company) throw new Error("Company not found")
    const name = args.name?.trim() || company.name
    await ctx.db.patch(companyId, {
      name,
      normalizedName: normalize(name),
      summary: args.summary.trim(),
      industry: args.industry.trim() || "Unknown",
      hqLocation: args.hqLocation.trim() || "Unknown",
      size: args.size.trim() || "Unknown",
      website: sanitizeOptionalUrl(args.website) ?? "",
      logo: sanitizeOptionalUrl(args.logo) ?? company.logo,
      banner: sanitizeOptionalUrl(args.banner) ?? company.banner,
      brandColor: normalizeHexColor(args.brandColor) ?? company.brandColor,
      socials: args.socials
        ? socialsSchema.parse(args.socials)
        : company.socials,
      enrichedAt: Date.now(),
    })
    return null
  },
})

export const remove = mutation({
  args: { companyId: v.string() },
  returns: v.null(),
  handler: async (ctx, { companyId }) => {
    await requireUserId(ctx)
    const company = await getCompanyOrThrow(ctx, companyId)
    const [applications, aliases] = await Promise.all([
      ctx.db.query("applications").collect(),
      ctx.db.query("applicationAliases").collect(),
    ])
    if (
      applications.some((application) => application.companyId === company._id)
    ) {
      throw new Error("Merge or delete applications before deleting company")
    }
    if (aliases.some((alias) => alias.companyId === company._id)) {
      throw new Error("Merge company before deleting aliases")
    }
    await ctx.db.delete(company._id)
    return null
  },
})

export const merge = mutation({
  args: {
    sourceCompanyId: v.string(),
    targetCompanyId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { sourceCompanyId, targetCompanyId }) => {
    const userId = await requireUserId(ctx)
    const source = await getCompanyOrThrow(ctx, sourceCompanyId)
    const target = await getCompanyOrThrow(ctx, targetCompanyId)
    if (source._id === target._id) throw new Error("Select different companies")

    const [applications, aliases] = await Promise.all([
      ctx.db.query("applications").collect(),
      ctx.db.query("applicationAliases").collect(),
    ])
    const sourceApplications = applications.filter(
      (application) => application.companyId === source._id
    )
    if (sourceApplications.length === 0)
      throw new Error("Company has no applications to merge")
    if (
      sourceApplications.some((application) => application.userId !== userId)
    ) {
      throw new Error("Company has applications from another user")
    }
    if (
      aliases.some(
        (alias) => alias.companyId === source._id && alias.userId !== userId
      )
    ) {
      throw new Error("Company has aliases from another user")
    }
    for (const application of sourceApplications) {
      const targetApplication = applications.find(
        (candidate) =>
          candidate.userId === userId &&
          candidate.companyId === target._id &&
          candidate.normalizedPosition === application.normalizedPosition
      )
      if (targetApplication) {
        await mergeApplicationIntoTargetCompanyApplication(
          ctx,
          application,
          targetApplication,
          target._id
        )
      } else {
        await ctx.db.patch(application._id, { companyId: target._id })
      }
    }
    const remainingAliases = await ctx.db.query("applicationAliases").collect()
    for (const alias of remainingAliases.filter(
      (candidate) =>
        candidate.userId === userId && candidate.companyId === source._id
    )) {
      await moveAlias(ctx, alias, target._id)
    }
    await ctx.db.delete(source._id)
    return null
  },
})

export const enrich = action({
  args: { companyId: v.string() },
  returns: v.null(),
  handler: async (ctx, { companyId }) => {
    await requireUserId(ctx)
    const company = await ctx.runQuery(api.companies.getForEnrichment, {
      companyId,
    })
    if (!company) throw new Error("Company not found")
    const enriched = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* CompanyEnrichmentService
        return yield* service.enrich(company.name, company.website)
      }).pipe(Effect.provide(CompanyEnrichmentServiceLive))
    )
    await ctx.runMutation(api.companies.saveEnrichment, {
      companyId,
      ...enriched,
    })
    return null
  },
})

export const getForEnrichment = query({
  args: { companyId: v.string() },
  handler: async (ctx, { companyId }) => {
    await requireUserId(ctx)
    const normalizedCompanyId = ctx.db.normalizeId("companies", companyId)
    if (!normalizedCompanyId) return null
    return await ctx.db.get(normalizedCompanyId)
  },
})

export const saveEnrichment = mutation({
  args: {
    companyId: v.string(),
    name: v.string(),
    summary: v.string(),
    industry: v.string(),
    hqLocation: v.string(),
    size: v.string(),
    logo: v.string(),
    banner: v.string(),
    brandColor: v.string(),
    website: v.string(),
    socials: socialsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireUserId(ctx)
    const companyId = ctx.db.normalizeId("companies", args.companyId)
    if (!companyId) throw new Error("Company not found")
    await ctx.db.patch(companyId, {
      name: args.name.trim() || "Unknown",
      normalizedName: normalize(args.name),
      summary: args.summary.trim(),
      industry: args.industry.trim() || "Unknown",
      hqLocation: args.hqLocation.trim() || "Unknown",
      size: args.size.trim() || "Unknown",
      logo: sanitizeOptionalUrl(args.logo) ?? "",
      banner: sanitizeOptionalUrl(args.banner),
      brandColor: normalizeHexColor(args.brandColor),
      website: sanitizeOptionalUrl(args.website) ?? "",
      socials: socialsSchema.parse(args.socials),
      enrichedAt: Date.now(),
    })
    return null
  },
})

function sanitizeOptionalUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  try {
    const url = new URL(trimmed)
    if (url.protocol === "http:" || url.protocol === "https:")
      return url.toString()
  } catch {
    return undefined
  }
  return undefined
}

function normalizeHexColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : undefined
}

async function getCompanyOrThrow(
  ctx: MutationCtx,
  companyId: string
): Promise<Doc<"companies">> {
  const normalizedCompanyId = ctx.db.normalizeId("companies", companyId)
  if (!normalizedCompanyId) throw new Error("Company not found")
  const company = await ctx.db.get(normalizedCompanyId)
  if (!company) throw new Error("Company not found")
  return company
}

async function moveAlias(
  ctx: MutationCtx,
  alias: Doc<"applicationAliases">,
  targetCompanyId: Id<"companies">
) {
  const duplicate = await ctx.db
    .query("applicationAliases")
    .withIndex("by_user_company_position", (q) =>
      q
        .eq("userId", alias.userId)
        .eq("companyId", targetCompanyId)
        .eq("normalizedPosition", alias.normalizedPosition)
    )
    .unique()
  if (duplicate) {
    await ctx.db.delete(alias._id)
    return
  }
  await ctx.db.patch(alias._id, { companyId: targetCompanyId })
}

async function mergeApplicationIntoTargetCompanyApplication(
  ctx: MutationCtx,
  source: Doc<"applications">,
  target: Doc<"applications">,
  targetCompanyId: Id<"companies">
) {
  const aliases = await ctx.db
    .query("applicationAliases")
    .withIndex("by_application", (q) => q.eq("applicationId", source._id))
    .collect()
  for (const alias of aliases) {
    await moveApplicationAlias(ctx, alias, targetCompanyId, target._id)
  }

  const events = await ctx.db
    .query("applicationEvents")
    .withIndex("by_application", (q) => q.eq("applicationId", source._id))
    .collect()
  for (const event of events) {
    const duplicate = await ctx.db
      .query("applicationEvents")
      .withIndex("by_application_source_type_date", (q) =>
        q
          .eq("applicationId", target._id)
          .eq("sourceEmailId", event.sourceEmailId)
          .eq("type", event.type)
          .eq("date", event.date)
      )
      .unique()
    if (duplicate) {
      await ctx.db.delete(event._id)
    } else {
      await ctx.db.patch(event._id, { applicationId: target._id })
    }
  }

  await reassignApplicationAgentData(ctx, source._id, target._id)
  await ctx.db.delete(source._id)
  await syncMergedApplication(ctx, target, source)
}

async function moveApplicationAlias(
  ctx: MutationCtx,
  alias: Doc<"applicationAliases">,
  targetCompanyId: Id<"companies">,
  targetApplicationId: Id<"applications">
) {
  const duplicate = await ctx.db
    .query("applicationAliases")
    .withIndex("by_user_company_position", (q) =>
      q
        .eq("userId", alias.userId)
        .eq("companyId", targetCompanyId)
        .eq("normalizedPosition", alias.normalizedPosition)
    )
    .unique()
  if (duplicate) {
    await ctx.db.delete(alias._id)
    return
  }
  await ctx.db.patch(alias._id, {
    applicationId: targetApplicationId,
    companyId: targetCompanyId,
  })
}

async function reassignApplicationAgentData(
  ctx: MutationCtx,
  sourceApplicationId: Id<"applications">,
  targetApplicationId: Id<"applications">
) {
  const [threads, drafts, versions] = await Promise.all([
    ctx.db
      .query("applicationAgentThreads")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", sourceApplicationId)
      )
      .collect(),
    ctx.db
      .query("tailoredCvDrafts")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", sourceApplicationId)
      )
      .collect(),
    ctx.db
      .query("tailoredCvVersions")
      .withIndex("by_application", (q) =>
        q.eq("applicationId", sourceApplicationId)
      )
      .collect(),
  ])
  await Promise.all([
    ...threads.map((thread) =>
      ctx.db.patch(thread._id, { applicationId: targetApplicationId })
    ),
    ...drafts.map((draft) =>
      ctx.db.patch(draft._id, { applicationId: targetApplicationId })
    ),
    ...versions.map((version) =>
      ctx.db.patch(version._id, { applicationId: targetApplicationId })
    ),
  ])
}

async function syncMergedApplication(
  ctx: MutationCtx,
  target: Doc<"applications">,
  source: Doc<"applications">
) {
  const events = await ctx.db
    .query("applicationEvents")
    .withIndex("by_application", (q) => q.eq("applicationId", target._id))
    .collect()
  const orderedEvents = events
    .slice()
    .sort((left, right) => left.date - right.date)
  const firstEvent = orderedEvents[0]
  const lastEvent = orderedEvents[orderedEvents.length - 1]
  if (firstEvent && lastEvent) {
    await ctx.db.patch(target._id, {
      status: lastEvent.type,
      appliedOn:
        orderedEvents.find((event) => event.type === "Applied")?.date ??
        firstEvent.date,
      lastUpdate: lastEvent.date,
    })
    return
  }

  const latest = source.lastUpdate > target.lastUpdate ? source : target
  const appliedDates = [target.appliedOn, source.appliedOn].flatMap((date) =>
    date === undefined ? [] : [date]
  )
  await ctx.db.patch(target._id, {
    status: latest.status,
    appliedOn: appliedDates.length > 0 ? Math.min(...appliedDates) : undefined,
    lastUpdate: latest.lastUpdate,
  })
}
