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

const common = {
  /** The lowercased email the agent gave as `login_hint`. */
  loginHint: v.string(),
  claimTokenDigest: v.string(),
  claimExpiresAt: v.number(),
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
export function parseLoginHint(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return null
  return email
}
