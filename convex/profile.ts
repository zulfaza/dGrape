import { Effect } from "effect";
import { v } from "convex/values";

import { action, mutation, query } from "./_generated/server";
import { requireUserId } from "./lib/auth";
import { userProfileValidator } from "./lib/profileDomain";
import { LlmService, LlmServiceLive } from "./lib/services";

const experienceTask = v.object({
  text: v.string(),
});

const experienceEntry = v.object({
  company: v.string(),
  companyDescription: v.optional(v.string()),
  location: v.string(),
  role: v.string(),
  position: v.union(
    v.literal(""),
    v.literal("full_time"),
    v.literal("contract"),
    v.literal("freelance"),
    v.literal("part_time"),
    v.literal("internship"),
  ),
  start: v.string(),
  end: v.string(),
  tasks: v.array(experienceTask),
});

const educationEntry = v.object({
  institution: v.string(),
  degree: v.string(),
  start: v.string(),
  end: v.string(),
  notes: v.string(),
});

const profileLink = v.object({
  label: v.string(),
  url: v.string(),
});

const importedProfile = v.object({
  name: v.string(),
  summary: v.string(),
  contacts: v.object({
    email: v.string(),
    phone: v.string(),
  }),
  links: v.array(profileLink),
  skills: v.array(v.string()),
  experience: v.array(experienceEntry),
  educations: v.array(educationEntry),
});

const MAX_CV_TEXT_CHARS = 50_000;

export const get = query({
  args: {},
  returns: v.union(userProfileValidator, v.null()),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) return null;
    return {
      name: profile.name,
      summary: profile.summary,
      contacts: profile.contacts,
      links: profile.links,
      skills: profile.skills ?? [],
      experience: profile.experience.map((entry) => ({
        ...entry,
        companyDescription: entry.companyDescription ?? "",
        role: entry.role ?? "",
        position: entry.position ?? "",
      })),
      educations: profile.educations,
    };
  },
});

export const save = mutation({
  args: { profile: userProfileValidator },
  returns: v.null(),
  handler: async (ctx, { profile }) => {
    const userId = await requireUserId(ctx);
    const now = Date.now();
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();

    const storedProfile = {
      ...profile,
      experience: profile.experience.map((entry) => ({
        ...entry,
        role: entry.role?.trim() ?? "",
        position: entry.position ?? "",
      })),
    };

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...storedProfile,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("profiles", {
      userId,
      ...storedProfile,
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const importFromCv = action({
  args: { cvText: v.string() },
  returns: importedProfile,
  handler: async (ctx, { cvText }) => {
    await requireUserId(ctx);
    const trimmed = cvText.trim();
    if (!trimmed) {
      throw new Error("No text found in PDF — try a text-based CV instead of a scanned image");
    }
    if (trimmed.length > MAX_CV_TEXT_CHARS) {
      throw new Error("CV text is too long");
    }

    const profile = await Effect.runPromise(
      Effect.gen(function* () {
        const llm = yield* LlmService;
        return yield* llm.extractProfileFromCv(trimmed);
      }).pipe(Effect.provide(LlmServiceLive)),
    );

    return {
      ...profile,
      experience: profile.experience.map((entry) => ({
        company: entry.company,
        companyDescription: entry.companyDescription,
        location: entry.location,
        role: entry.role,
        position: entry.position,
        start: entry.start,
        end: entry.end,
        tasks: entry.tasks.map((text) => ({ text })),
      })),
    };
  },
});
