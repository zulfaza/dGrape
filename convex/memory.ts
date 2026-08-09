import { v } from "convex/values"

import { mutation, query } from "./_generated/server"
import { requireUserId } from "./lib/auth"
import {
  candidatePreferencesValidator,
  evidenceKindValidator,
  evidenceVerificationValidator,
  ruleScopeValidator,
  ruleSourceValidator,
} from "./lib/workflowDomain"

const evidenceInput = v.object({
  id: v.optional(v.string()),
  claim: v.string(),
  kind: evidenceKindValidator,
  source: v.string(),
  context: v.string(),
  verification: evidenceVerificationValidator,
  confidence: v.number(),
  reusable: v.boolean(),
})

const ruleInput = v.object({
  id: v.optional(v.string()),
  scope: ruleScopeValidator,
  roleFamily: v.optional(v.string()),
  instruction: v.string(),
  source: ruleSourceValidator,
  active: v.boolean(),
})

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUserId(ctx)
    const [preferences, evidence, rules, baselines] = await Promise.all([
      ctx.db
        .query("candidatePreferences")
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
        .query("candidateCvBaselines")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ])
    return {
      preferences: preferences?.preferences ?? emptyPreferences(),
      evidence: evidence.sort(
        (left, right) => right.updatedAt - left.updatedAt
      ),
      rules: rules.sort((left, right) => right.updatedAt - left.updatedAt),
      baselines: baselines
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .map(({ profileSnapshot: _profileSnapshot, ...baseline }) => baseline),
      updatedAt: Math.max(
        preferences?.updatedAt ?? 0,
        ...evidence.map((entry) => entry.updatedAt),
        ...rules.map((entry) => entry.updatedAt),
        ...baselines.map((entry) => entry.updatedAt)
      ),
    }
  },
})

export const save = mutation({
  args: {
    preferences: candidatePreferencesValidator,
    evidence: v.array(evidenceInput),
    rules: v.array(ruleInput),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx)
    const now = Date.now()
    const [storedPreferences, storedEvidence, storedRules] = await Promise.all([
      ctx.db
        .query("candidatePreferences")
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

    const preferences = {
      ...args.preferences,
      roleFamilies: cleanList(args.preferences.roleFamilies),
      stacks: cleanList(args.preferences.stacks),
      domains: cleanList(args.preferences.domains),
      levels: cleanList(args.preferences.levels),
      locations: cleanList(args.preferences.locations),
      dealbreakers: cleanList(args.preferences.dealbreakers),
    }
    if (storedPreferences) {
      await ctx.db.patch(storedPreferences._id, { preferences, updatedAt: now })
    } else {
      await ctx.db.insert("candidatePreferences", {
        userId,
        preferences,
        createdAt: now,
        updatedAt: now,
      })
    }

    const keptEvidence = new Set<string>()
    for (const entry of args.evidence) {
      const claim = entry.claim.trim()
      if (!claim) continue
      const id = entry.id
        ? ctx.db.normalizeId("candidateEvidence", entry.id)
        : null
      const existing = id ? await ctx.db.get(id) : null
      const values = {
        userId,
        claim: claim.slice(0, 1_000),
        kind: entry.kind,
        source: entry.source.trim().slice(0, 1_000),
        context: entry.context.trim().slice(0, 2_000),
        verification: entry.verification,
        confidence: Math.min(1, Math.max(0, entry.confidence)),
        reusable: entry.reusable,
        updatedAt: now,
      }
      if (existing?.userId === userId) {
        await ctx.db.patch(existing._id, values)
        keptEvidence.add(existing._id)
      } else {
        keptEvidence.add(
          await ctx.db.insert("candidateEvidence", {
            ...values,
            createdAt: now,
          })
        )
      }
    }
    for (const entry of storedEvidence) {
      if (!keptEvidence.has(entry._id)) await ctx.db.delete(entry._id)
    }

    const keptRules = new Set<string>()
    for (const entry of args.rules) {
      const instruction = entry.instruction.trim()
      if (!instruction) continue
      if (entry.scope === "role_family" && !entry.roleFamily?.trim()) {
        throw new Error("Role-family rules require a role family")
      }
      const id = entry.id
        ? ctx.db.normalizeId("candidateRules", entry.id)
        : null
      const existing = id ? await ctx.db.get(id) : null
      const values = {
        userId,
        scope: entry.scope,
        ...(entry.scope === "role_family"
          ? { roleFamily: entry.roleFamily?.trim() }
          : {}),
        instruction: instruction.slice(0, 2_000),
        source: entry.source,
        active: entry.active,
        updatedAt: now,
      }
      if (existing?.userId === userId) {
        await ctx.db.patch(existing._id, {
          ...values,
          ...(entry.scope === "global" ? { roleFamily: undefined } : {}),
        })
        keptRules.add(existing._id)
      } else {
        keptRules.add(
          await ctx.db.insert("candidateRules", { ...values, createdAt: now })
        )
      }
    }
    for (const entry of storedRules) {
      if (!keptRules.has(entry._id)) await ctx.db.delete(entry._id)
    }
    return null
  },
})

export const createBaseline = mutation({
  args: { name: v.string(), roleFamilies: v.array(v.string()) },
  returns: v.id("candidateCvBaselines"),
  handler: async (ctx, { name, roleFamilies }) => {
    const userId = await requireUserId(ctx)
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()
    if (!profile)
      throw new Error("Save your profile before creating a CV baseline")
    const normalizedName = name.trim()
    if (!normalizedName) throw new Error("Baseline name is required")
    const now = Date.now()
    return await ctx.db.insert("candidateCvBaselines", {
      userId,
      name: normalizedName.slice(0, 120),
      roleFamilies: cleanList(roleFamilies),
      profileSnapshot: {
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
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const removeBaseline = mutation({
  args: { baselineId: v.string() },
  returns: v.null(),
  handler: async (ctx, { baselineId }) => {
    const userId = await requireUserId(ctx)
    const id = ctx.db.normalizeId("candidateCvBaselines", baselineId)
    if (!id) throw new Error("Baseline not found")
    const baseline = await ctx.db.get(id)
    if (!baseline || baseline.userId !== userId)
      throw new Error("Baseline not found")
    await ctx.db.delete(id)
    return null
  },
})

function emptyPreferences() {
  return {
    roleFamilies: [],
    stacks: [],
    domains: [],
    levels: [],
    locations: [],
    workModes: [] as Array<"remote" | "hybrid" | "onsite">,
    visaNeed: "unknown" as const,
    dealbreakers: [],
  }
}

function cleanList(values: string[]): string[] {
  return [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ].slice(0, 100)
}
