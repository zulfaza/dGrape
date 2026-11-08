import { v, type Infer } from "convex/values"
import { storedScopesValidator } from "./agentScope"

/**
 * The auth.md user-claimed (service_auth) registration model. A
 * registration is pending until a signed-in user with the hinted email
 * confirms it on the claim page and chooses a workspace and scope. Only a
 * claimed registration can get tokens, and only for that workspace.
 */

/** How long the agent may wait for the user to claim, in total. */
export const CLAIM_WINDOW_MS = 24 * 60 * 60 * 1000
/** How long one user code and claim link stay valid. */
export const CLAIM_ATTEMPT_MS = 10 * 60 * 1000
/** The minimum seconds between two token polls. */
export const POLL_INTERVAL_SECONDS = 5
/** How long one access token from /oauth2/token is valid. */
export const ACCESS_TOKEN_LIFETIME_MS = 60 * 60 * 1000
/** Wrong codes allowed for one claim attempt before it locks. */
export const MAX_CODE_TRIES = 5
/** Claim attempts (codes) allowed for one registration. */
export const MAX_CLAIM_ATTEMPTS = 10
/** Pending registrations allowed for one email at a time. */
export const MAX_PENDING_PER_EMAIL = 5

/**
 * The trusted agent provider that registered an agent-verified
 * (`identity_assertion`) registration, and its opaque user identifier.
 * Absent for `service_auth` registrations.
 */
export const providerBindingValidator = v.object({
  issuer: v.string(),
  subject: v.string(),
})

const common = {
  /**
   * The lowercased email: the `login_hint` of a service_auth registration,
   * or the verified email in the provider's assertion.
   */
  loginHint: v.string(),
  claimTokenDigest: v.string(),
  claimExpiresAt: v.number(),
  provider: v.optional(providerBindingValidator),
}

export const agentRegistrationValidator = v.union(
  v.object({
    ...common,
    status: v.literal("pending"),
    /** The last token poll, to enforce the poll interval. */
    lastPolledAt: v.optional(v.number()),
  }),
  v.object({
    ...common,
    status: v.literal("claimed"),
    owner: v.string(),
    workspaceId: v.id("workspaces"),
    scope: storedScopesValidator,
    claimedAt: v.number(),
    /** Set when the claim grant has returned the first tokens. */
    claimTokenUsedAt: v.optional(v.number()),
  }),
  v.object({
    ...common,
    status: v.literal("revoked"),
    owner: v.string(),
    workspaceId: v.id("workspaces"),
    revokedAt: v.number(),
  })
)

export type AgentRegistration = Infer<typeof agentRegistrationValidator>

/** The fields every registration state keeps, for a state change. */
export function commonFields(registration: AgentRegistration) {
  return {
    loginHint: registration.loginHint,
    claimTokenDigest: registration.claimTokenDigest,
    claimExpiresAt: registration.claimExpiresAt,
    provider: registration.provider,
  }
}

export const agentClaimAttemptValidator = v.object({
  registrationId: v.id("agentRegistrations"),
  attemptTokenDigest: v.string(),
  /** HMAC of the 6-digit code; see convex/lib/agentAuthCrypto.ts. */
  userCodeDigest: v.string(),
  expiresAt: v.number(),
  failedTries: v.number(),
  /** "replaced": the agent asked for a new code, so this one stopped working. */
  state: v.union(
    v.literal("open"),
    v.literal("completed"),
    v.literal("locked"),
    v.literal("replaced")
  ),
})

/**
 * Parses a `login_hint` as an email address. auth.md lets the service
 * decide the hint format; this service accepts only email addresses.
 */
export function parseLoginHint(value: string): string | null {
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return null
  return email
}
