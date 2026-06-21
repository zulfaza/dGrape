import { v } from "convex/values";
import { z } from "zod";

import { userProfileValidator } from "./profileDomain";

export const cvChangeValidator = v.object({
  section: v.string(),
  previousText: v.string(),
  replacement: v.string(),
  rationale: v.string(),
});

export const cvMatchAnalysisValidator = v.object({
  overallAssessment: v.string(),
  matchingStrengths: v.array(v.string()),
  missingRequirements: v.array(v.string()),
  matchedKeywords: v.array(v.string()),
  missingKeywords: v.array(v.string()),
  recommendedImprovements: v.array(v.string()),
  appliedChanges: v.array(cvChangeValidator),
});

export const tailoredCvArtifactValidator = v.object({
  profileSnapshot: userProfileValidator,
  analysis: cvMatchAnalysisValidator,
});

const cvChangeSchema = z.object({
  section: z.string(),
  previousText: z.string(),
  replacement: z.string(),
  rationale: z.string(),
});

export const cvMatchAnalysisSchema = z.object({
  overallAssessment: z.string(),
  matchingStrengths: z.array(z.string()),
  missingRequirements: z.array(z.string()),
  matchedKeywords: z.array(z.string()),
  missingKeywords: z.array(z.string()),
  recommendedImprovements: z.array(z.string()),
  appliedChanges: z.array(cvChangeSchema),
});

const profileLinkSchema = z.object({
  id: z.string(),
  label: z.enum(["website", "github", "linkedin", "twitter"]),
  url: z.string(),
});

const experienceTaskSchema = z.object({
  id: z.string(),
  text: z.string(),
});

const experienceEntrySchema = z.object({
  id: z.string(),
  company: z.string(),
  companyDescription: z.string().optional(),
  location: z.string(),
  role: z.string(),
  position: z.enum(["", "full_time", "contract", "freelance", "part_time", "internship"]),
  start: z.string(),
  end: z.string(),
  tasks: z.array(experienceTaskSchema),
});

const educationEntrySchema = z.object({
  id: z.string(),
  institution: z.string(),
  degree: z.string(),
  start: z.string(),
  end: z.string(),
  notes: z.string(),
});

const skillGroupSchema = z.object({
  label: z.string(),
  skills: z.array(z.string()),
});

export const userProfileSchema = z.object({
  name: z.string(),
  summary: z.string(),
  contacts: z.object({
    email: z.string(),
    phone: z.string(),
  }),
  links: z.array(profileLinkSchema),
  skills: z.array(z.string()),
  skillGroups: z.array(skillGroupSchema),
  experience: z.array(experienceEntrySchema),
  educations: z.array(educationEntrySchema),
});

export const tailoredCvArtifactSchema = z.object({
  profileSnapshot: userProfileSchema,
  analysis: cvMatchAnalysisSchema,
});

export const applicationAgentMessageMetadataValidator = v.object({
  provider: v.union(v.literal("deepseek"), v.literal("openai")),
  model: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  totalTokens: v.number(),
});

export type ApplicationAgentMessageMetadata = {
  provider: "deepseek" | "openai";
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ApplicationAgentResponse = {
  response: string;
  tailoredCv: z.infer<typeof tailoredCvArtifactSchema> | null;
  metadata: ApplicationAgentMessageMetadata;
};
