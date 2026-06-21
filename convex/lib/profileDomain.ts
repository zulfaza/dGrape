import { v } from "convex/values";
import { z } from "zod";

export const profileLinkTypeValidator = v.union(
  v.literal("website"),
  v.literal("github"),
  v.literal("linkedin"),
  v.literal("twitter"),
);

const experienceTaskValidator = v.object({
  id: v.string(),
  text: v.string(),
});

export const experiencePositionValidator = v.union(
  v.literal(""),
  v.literal("full_time"),
  v.literal("contract"),
  v.literal("freelance"),
  v.literal("part_time"),
  v.literal("internship"),
);

const experienceEntryValidator = v.object({
  id: v.string(),
  company: v.string(),
  companyDescription: v.optional(v.string()),
  location: v.string(),
  role: v.optional(v.string()),
  position: experiencePositionValidator,
  start: v.string(),
  end: v.string(),
  tasks: v.array(experienceTaskValidator),
});

const storedExperienceEntryValidator = v.object({
  id: v.string(),
  company: v.string(),
  companyDescription: v.optional(v.string()),
  location: v.string(),
  role: v.optional(v.string()),
  position: v.optional(experiencePositionValidator),
  start: v.string(),
  end: v.string(),
  tasks: v.array(experienceTaskValidator),
});

const educationEntryValidator = v.object({
  id: v.string(),
  institution: v.string(),
  degree: v.string(),
  start: v.string(),
  end: v.string(),
  notes: v.string(),
});

const projectEntryValidator = v.object({
  id: v.string(),
  title: v.string(),
  description: v.string(),
  link: v.string(),
});

const profileLinkEntryValidator = v.object({
  id: v.string(),
  label: profileLinkTypeValidator,
  url: v.string(),
});

const skillGroupValidator = v.object({
  label: v.string(),
  skills: v.array(v.string()),
});

export const userProfileValidator = v.object({
  name: v.string(),
  summary: v.string(),
  contacts: v.object({
    email: v.string(),
    phone: v.string(),
  }),
  links: v.array(profileLinkEntryValidator),
  skills: v.optional(v.array(v.string())),
  skillGroups: v.optional(v.array(skillGroupValidator)),
  experience: v.array(experienceEntryValidator),
  projects: v.optional(v.array(projectEntryValidator)),
  educations: v.array(educationEntryValidator),
});

export const profileDocumentValidator = v.object({
  userId: v.string(),
  name: v.string(),
  summary: v.string(),
  contacts: v.object({
    email: v.string(),
    phone: v.string(),
  }),
  links: v.array(profileLinkEntryValidator),
  skills: v.optional(v.array(v.string())),
  experience: v.array(storedExperienceEntryValidator),
  projects: v.optional(v.array(projectEntryValidator)),
  educations: v.array(educationEntryValidator),
  createdAt: v.number(),
  updatedAt: v.number(),
});

export const extractedExperienceSchema = z.object({
  company: z.string(),
  companyDescription: z.string().optional(),
  location: z.string(),
  role: z.string(),
  position: z.enum(["", "full_time", "contract", "freelance", "part_time", "internship"]),
  start: z.string(),
  end: z.string(),
  tasks: z.array(z.string()),
});

export const extractedEducationSchema = z.object({
  institution: z.string(),
  degree: z.string(),
  start: z.string(),
  end: z.string(),
  notes: z.string(),
});

export const extractedProfileLinkSchema = z.object({
  label: z.string(),
  url: z.string(),
});

export const extractedProfileSchema = z.object({
  name: z.string(),
  summary: z.string(),
  contacts: z.object({
    email: z.string(),
    phone: z.string(),
  }),
  links: z.array(extractedProfileLinkSchema),
  skills: z.array(z.string()),
  experience: z.array(extractedExperienceSchema),
  educations: z.array(extractedEducationSchema),
});

export type ExtractedProfile = z.infer<typeof extractedProfileSchema>;
