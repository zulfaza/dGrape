import { Effect } from "effect";
import { v } from "convex/values";

import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { normalize, socialsSchema } from "./lib/domain";
import { CompanyEnrichmentService, CompanyEnrichmentServiceLive } from "./lib/services";

const socialsValidator = v.object({
  linkedin: v.optional(v.string()),
  twitter: v.optional(v.string()),
  facebook: v.optional(v.string()),
  instagram: v.optional(v.string()),
  youtube: v.optional(v.string()),
  github: v.optional(v.string()),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUserId(ctx);
    const companies = await ctx.db.query("companies").collect();
    return companies
      .map((company) => ({
        ...company,
        id: company._id,
        banner: company.banner ?? "",
        brandColor: company.brandColor ?? "",
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  },
});

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
    await requireUserId(ctx);
    const companyId = ctx.db.normalizeId("companies", args.companyId);
    if (!companyId) throw new Error("Company not found");
    const company = await ctx.db.get(companyId);
    if (!company) throw new Error("Company not found");
    const name = args.name?.trim() || company.name;
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
      socials: args.socials ? socialsSchema.parse(args.socials) : company.socials,
      enrichedAt: Date.now(),
    });
    return null;
  },
});

export const enrich = action({
  args: { companyId: v.string() },
  returns: v.null(),
  handler: async (ctx, { companyId }) => {
    await requireUserId(ctx);
    const company = await ctx.runQuery(api.companies.getForEnrichment, {
      companyId,
    });
    if (!company) throw new Error("Company not found");
    const enriched = await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* CompanyEnrichmentService;
        return yield* service.enrich(company.name, company.website);
      }).pipe(Effect.provide(CompanyEnrichmentServiceLive)),
    );
    await ctx.runMutation(api.companies.saveEnrichment, {
      companyId,
      ...enriched,
    });
    return null;
  },
});

export const getForEnrichment = query({
  args: { companyId: v.string() },
  handler: async (ctx, { companyId }) => {
    await requireUserId(ctx);
    const normalizedCompanyId = ctx.db.normalizeId("companies", companyId);
    if (!normalizedCompanyId) return null;
    return await ctx.db.get(normalizedCompanyId);
  },
});

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
    await requireUserId(ctx);
    const companyId = ctx.db.normalizeId("companies", args.companyId);
    if (!companyId) throw new Error("Company not found");
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
    });
    return null;
  },
});

function sanitizeOptionalUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

function normalizeHexColor(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : undefined;
}
