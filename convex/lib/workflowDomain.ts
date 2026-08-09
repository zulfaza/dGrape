import { v } from "convex/values"
import { z } from "zod"

import type { ApplicationStatus } from "./domain"

export const preparationStatuses = [
  "discovered",
  "qualified",
  "preparing",
  "ready",
  "archived",
] as const
export type PreparationStatus = (typeof preparationStatuses)[number]
export const preparationStatusValidator = v.union(
  v.literal("discovered"),
  v.literal("qualified"),
  v.literal("preparing"),
  v.literal("ready"),
  v.literal("archived")
)

export const hiringStatuses = [
  "not_applied",
  "applied",
  "assessment",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
] as const
export type HiringStatus = (typeof hiringStatuses)[number]
export const hiringStatusValidator = v.union(
  v.literal("not_applied"),
  v.literal("applied"),
  v.literal("assessment"),
  v.literal("interview"),
  v.literal("offer"),
  v.literal("rejected"),
  v.literal("withdrawn")
)

export const visaNeedValidator = v.union(
  v.literal("not_required"),
  v.literal("has_authorization"),
  v.literal("requires_sponsorship"),
  v.literal("unknown")
)

export const candidatePreferencesValidator = v.object({
  roleFamilies: v.array(v.string()),
  stacks: v.array(v.string()),
  domains: v.array(v.string()),
  levels: v.array(v.string()),
  locations: v.array(v.string()),
  workModes: v.array(
    v.union(v.literal("remote"), v.literal("hybrid"), v.literal("onsite"))
  ),
  visaNeed: visaNeedValidator,
  dealbreakers: v.array(v.string()),
})

export const evidenceKindValidator = v.union(
  v.literal("work"),
  v.literal("project"),
  v.literal("education"),
  v.literal("skill"),
  v.literal("metric"),
  v.literal("credential")
)

export const evidenceVerificationValidator = v.union(
  v.object({ state: v.literal("unverified") }),
  v.object({ state: v.literal("verified"), verifiedAt: v.number() })
)

export const ruleScopeValidator = v.union(
  v.literal("global"),
  v.literal("role_family")
)
export const ruleSourceValidator = v.union(
  v.object({ type: v.literal("manual") }),
  v.object({ type: v.literal("feedback"), feedback: v.string() })
)

export const jobBriefValidator = v.object({
  responsibilities: v.array(v.string()),
  requirements: v.array(v.string()),
  stack: v.array(v.string()),
  domain: v.string(),
  level: v.string(),
  location: v.string(),
  workMode: v.union(
    v.literal("remote"),
    v.literal("hybrid"),
    v.literal("onsite"),
    v.literal("unknown")
  ),
  compensation: v.string(),
  visaSignal: v.string(),
})

export const fitDecisionValidator = v.union(
  v.literal("strong_fit"),
  v.literal("possible_fit"),
  v.literal("low_fit"),
  v.literal("ineligible")
)
export const fitBandValidator = v.union(
  v.literal("high"),
  v.literal("medium"),
  v.literal("low")
)
export const eligibilityValidator = v.union(
  v.literal("eligible"),
  v.literal("risk"),
  v.literal("ineligible"),
  v.literal("unknown")
)
export const riskSignalValidator = v.union(
  v.literal("pass"),
  v.literal("risk"),
  v.literal("fail"),
  v.literal("unknown")
)

export const fitAssessmentValidator = v.object({
  decision: fitDecisionValidator,
  scoreBand: fitBandValidator,
  eligibility: eligibilityValidator,
  summary: v.string(),
  strengths: v.array(v.string()),
  gaps: v.array(v.string()),
  risks: v.array(v.string()),
  evidenceRefs: v.array(v.string()),
  signals: v.object({
    visa: riskSignalValidator,
    location: riskSignalValidator,
    seniority: riskSignalValidator,
  }),
  confidence: v.number(),
})

export const jobBriefSchema = z.object({
  responsibilities: z.array(z.string()),
  requirements: z.array(z.string()),
  stack: z.array(z.string()),
  domain: z.string(),
  level: z.string(),
  location: z.string(),
  workMode: z.enum(["remote", "hybrid", "onsite", "unknown"]),
  compensation: z.string(),
  visaSignal: z.string(),
})

export const fitAssessmentSchema = z.object({
  decision: z.enum(["strong_fit", "possible_fit", "low_fit", "ineligible"]),
  scoreBand: z.enum(["high", "medium", "low"]),
  eligibility: z.enum(["eligible", "risk", "ineligible", "unknown"]),
  summary: z.string(),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  risks: z.array(z.string()),
  evidenceRefs: z.array(z.string()),
  signals: z.object({
    visa: z.enum(["pass", "risk", "fail", "unknown"]),
    location: z.enum(["pass", "risk", "fail", "unknown"]),
    seniority: z.enum(["pass", "risk", "fail", "unknown"]),
  }),
  confidence: z.number().min(0).max(1),
})

export const fitGenerationSchema = z.object({
  brief: jobBriefSchema,
  assessment: fitAssessmentSchema,
})
export type FitGeneration = z.infer<typeof fitGenerationSchema>

export const artifactTypeValidator = v.union(
  v.literal("cv"),
  v.literal("cover_letter"),
  v.literal("email"),
  v.literal("recruiter_note"),
  v.literal("interview_prep")
)
export const artifactStateValidator = v.union(
  v.literal("draft"),
  v.literal("saved"),
  v.literal("exported")
)

export const applicationTaskTypeValidator = v.union(
  v.literal("apply"),
  v.literal("follow_up"),
  v.literal("interview"),
  v.literal("assessment"),
  v.literal("custom")
)

export function workflowStateFromLegacy(status: ApplicationStatus): {
  preparationStatus: PreparationStatus
  hiringStatus: HiringStatus
} {
  switch (status) {
    case "Saved":
      return { preparationStatus: "discovered", hiringStatus: "not_applied" }
    case "Applied":
      return { preparationStatus: "ready", hiringStatus: "applied" }
    case "Test":
      return { preparationStatus: "ready", hiringStatus: "assessment" }
    case "Interview":
      return { preparationStatus: "ready", hiringStatus: "interview" }
    case "Offer":
      return { preparationStatus: "ready", hiringStatus: "offer" }
    case "Rejected":
      return { preparationStatus: "ready", hiringStatus: "rejected" }
  }
}

export function legacyStatusFromHiring(
  status: HiringStatus
): ApplicationStatus {
  switch (status) {
    case "not_applied":
    case "withdrawn":
      return "Saved"
    case "applied":
      return "Applied"
    case "assessment":
      return "Test"
    case "interview":
      return "Interview"
    case "offer":
      return "Offer"
    case "rejected":
      return "Rejected"
  }
}

export function canTransitionPreparation(
  from: PreparationStatus,
  to: PreparationStatus
): boolean {
  if (from === to) return true
  if (to === "archived") return true
  if (from === "archived") return to === "discovered"
  return (
    preparationStatuses.indexOf(to) === preparationStatuses.indexOf(from) + 1
  )
}

export function canTransitionHiring(
  from: HiringStatus,
  to: HiringStatus
): boolean {
  if (from === to) return true
  const transitions: Record<HiringStatus, HiringStatus[]> = {
    not_applied: ["applied", "withdrawn"],
    applied: ["assessment", "interview", "offer", "rejected", "withdrawn"],
    assessment: ["interview", "offer", "rejected", "withdrawn"],
    interview: ["assessment", "offer", "rejected", "withdrawn"],
    offer: ["withdrawn"],
    rejected: ["applied"],
    withdrawn: ["applied"],
  }
  return transitions[from].includes(to)
}

export function unsupportedNumericClaims(
  content: string,
  candidateSources: string
): string[] {
  const normalizedSources = candidateSources.toLocaleLowerCase()
  const claims =
    content.match(
      /\b\d+(?:[.,]\d+)?(?:%|\+|x| years?| months?)(?=\s|[.,;:!?)]|$)/gi
    ) ?? []
  return claims.filter(
    (claim) => !normalizedSources.includes(claim.toLocaleLowerCase())
  )
}
