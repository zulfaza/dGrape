import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v, type Infer } from "convex/values"
import { Schema } from "effect"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { action, internalMutation, mutation, query } from "./_generated/server"
import { keyedDigest, sha256 } from "./lib/agentAuthCrypto"
import { codeKey, workosApiKey } from "./lib/agentAuthConfig"
import {
  agentScopeValidator,
  grantedScopes,
  parseRequestedScopes,
} from "./lib/agentScope"
import { memberWithAccess, requireMembership, requireUserId } from "./lib/auth"
import { recordAuditEvent } from "./lib/auditEvents"
import {
  ACCESS_TOKEN_LIFETIME_MS,
  CLAIM_ATTEMPT_MS,
  CLAIM_WINDOW_MS,
  MAX_CLAIM_ATTEMPTS,
  MAX_CODE_TRIES,
  MAX_PENDING_PER_EMAIL,
  POLL_INTERVAL_SECONDS,
  commonFields,
  providerBindingValidator,
} from "./lib/agentRegistration"
import { recordJti } from "./lib/assertionReplay"
import { findTrustedIssuer } from "./lib/trustedIssuers"

/**
 * auth.md registration state changes. convex/http.ts calls these after it
 * parses the request and creates the tokens, so only digests reach the
 * database.
 */

const registerResult = v.union(
  v.object({ status: v.literal("rate_limited") }),
  v.object({
    status: v.literal("registered"),
    registrationId: v.id("agentRegistrations"),
    claimExpiresAt: v.number(),
    attemptExpiresAt: v.number(),
  })
)

/** The new claim token, first claim attempt, and time of a registration. */
const startArgs = v.object({
  claimTokenDigest: v.string(),
  attemptTokenDigest: v.string(),
  userCodeDigest: v.string(),
  now: v.number(),
})

/**
 * Creates a pending registration for `email` with its first claim attempt,
 * unless the email already has too many pending registrations.
 */
async function startRegistration(
  ctx: MutationCtx,
  email: string,
  provider: Infer<typeof providerBindingValidator> | undefined,
  args: Infer<typeof startArgs>
): Promise<Infer<typeof registerResult>> {
  const open = await ctx.db
    .query("agentRegistrations")
    .withIndex("by_loginHint_and_status_and_claimExpiresAt", (q) =>
      q
        .eq("loginHint", email)
        .eq("status", "pending")
        .gt("claimExpiresAt", args.now)
    )
    .take(MAX_PENDING_PER_EMAIL)
  if (open.length >= MAX_PENDING_PER_EMAIL) return { status: "rate_limited" }
  const claimExpiresAt = args.now + CLAIM_WINDOW_MS
  const attemptExpiresAt = args.now + CLAIM_ATTEMPT_MS
  const registrationId = await ctx.db.insert("agentRegistrations", {
    status: "pending",
    loginHint: email,
    claimTokenDigest: args.claimTokenDigest,
    claimExpiresAt,
    provider,
  })
  await ctx.db.insert("agentClaimAttempts", {
    registrationId,
    attemptTokenDigest: args.attemptTokenDigest,
    userCodeDigest: args.userCodeDigest,
    expiresAt: attemptExpiresAt,
    failedTries: 0,
    state: "open",
  })
  return {
    status: "registered",
    registrationId,
    claimExpiresAt,
    attemptExpiresAt,
  }
}

/** Starts a service_auth registration with its first claim attempt. */
export const register = internalMutation({
  args: { loginHint: v.string(), ...startArgs.fields },
  returns: registerResult,
  handler: async (ctx, { loginHint, ...args }) =>
    startRegistration(ctx, loginHint, undefined, args),
})

const registerVerifiedResult = v.union(
  registerResult,
  v.object({ status: v.literal("replay_detected") }),
  v.object({
    status: v.literal("linked"),
    registrationId: v.id("agentRegistrations"),
    scopes: v.array(agentScopeValidator),
  })
)

/**
 * Agent-verified registration, after convex/agentIdentityHttp.ts has
 * verified the provider's assertion. It records the assertion's `jti`, so
 * the assertion works once. When the same provider user already linked a
 * registration for the same email, the agent gets that registration.
 * Otherwise the user must confirm on the claim page first: this service
 * never binds an agent to an account only because the emails match.
 */
export const registerVerified = internalMutation({
  args: {
    issuer: v.string(),
    subject: v.string(),
    email: v.string(),
    jti: v.string(),
    replayExpiresAt: v.number(),
    ...startArgs.fields,
  },
  returns: registerVerifiedResult,
  handler: async (
    ctx,
    { issuer, subject, email, jti, replayExpiresAt, ...args }
  ): Promise<Infer<typeof registerVerifiedResult>> => {
    if (!(await recordJti(ctx, issuer, jti, replayExpiresAt)))
      return { status: "replay_detected" }
    const registration = await ctx.db
      .query("agentRegistrations")
      .withIndex(
        "by_providerIssuer_and_providerSubject_and_status_and_loginHint",
        (q) =>
          q
            .eq("provider.issuer", issuer)
            .eq("provider.subject", subject)
            .eq("status", "claimed")
            .eq("loginHint", email)
      )
      .order("desc")
      .first()
    if (registration?.status === "claimed")
      return {
        status: "linked",
        registrationId: registration._id,
        scopes: [...grantedScopes(registration.scope)],
      }
    return startRegistration(ctx, email, { issuer, subject }, args)
  },
})

/** An open claim attempt and its pending registration, or null. */
async function openClaim(
  ctx: QueryCtx,
  attemptTokenDigest: string,
  now: number
): Promise<{
  attempt: Doc<"agentClaimAttempts">
  registration: Doc<"agentRegistrations">
} | null> {
  const attempt = await ctx.db
    .query("agentClaimAttempts")
    .withIndex("by_attemptTokenDigest", (q) =>
      q.eq("attemptTokenDigest", attemptTokenDigest)
    )
    .unique()
  if (!attempt || attempt.state !== "open" || attempt.expiresAt <= now)
    return null
  const registration = await ctx.db.get(attempt.registrationId)
  if (
    !registration ||
    registration.status !== "pending" ||
    registration.claimExpiresAt <= now
  )
    return null
  // An operator can stop trusting a provider. Its pending registrations
  // then cannot be claimed.
  if (registration.provider && !findTrustedIssuer(registration.provider.issuer))
    return null
  return { attempt, registration }
}

/**
 * What the claim page shows: the email the agent named, and when the code
 * expires. Any token that cannot be claimed reads as "unavailable", so the
 * page does not reveal why.
 */
const claimDetailsResult = v.union(
  v.object({ status: v.literal("unavailable") }),
  v.object({
    status: v.literal("open"),
    email: v.string(),
    expiresAt: v.number(),
    /**
     * The display name of the trusted agent provider, from the pinned
     * registry, for an agent-verified registration. A provider cannot set it.
     */
    providerName: v.union(v.string(), v.null()),
  })
)

export const claimDetails = query({
  args: { attemptToken: v.string() },
  returns: claimDetailsResult,
  handler: async (
    ctx,
    { attemptToken }
  ): Promise<Infer<typeof claimDetailsResult>> => {
    await requireUserId(ctx)
    const claim = await openClaim(ctx, await sha256(attemptToken), Date.now())
    if (!claim) return { status: "unavailable" }
    const provider = claim.registration.provider
    return {
      status: "open",
      email: claim.registration.loginHint,
      expiresAt: claim.attempt.expiresAt,
      providerName: provider
        ? (findTrustedIssuer(provider.issuer)?.displayName ?? null)
        : null,
    }
  },
})

const completeResult = v.union(
  v.literal("claimed"),
  v.literal("unavailable"),
  v.literal("wrong_account"),
  v.literal("wrong_code"),
  v.literal("locked"),
  v.literal("no_workspace_access")
)

export const completeClaim = internalMutation({
  args: {
    attemptTokenDigest: v.string(),
    userCodeDigest: v.string(),
    owner: v.string(),
    email: v.string(),
    workspaceId: v.id("workspaces"),
    scopes: v.array(agentScopeValidator),
    now: v.number(),
  },
  returns: v.union(completeResult, v.literal("invalid_scopes")),
  handler: async (
    ctx,
    args
  ): Promise<Infer<typeof completeResult> | "invalid_scopes"> => {
    const scopes = parseRequestedScopes(args.scopes)
    if (!scopes) return "invalid_scopes"
    const claim = await openClaim(ctx, args.attemptTokenDigest, args.now)
    if (!claim) return "unavailable"
    const { attempt, registration } = claim
    if (registration.loginHint !== args.email) return "wrong_account"
    if (attempt.userCodeDigest !== args.userCodeDigest) {
      const failedTries = attempt.failedTries + 1
      if (failedTries < MAX_CODE_TRIES) {
        await ctx.db.patch(attempt._id, { failedTries })
        return "wrong_code"
      }
      await ctx.db.patch(attempt._id, { failedTries, state: "locked" })
      return "locked"
    }
    const member = await memberWithAccess(
      ctx,
      args.workspaceId,
      args.owner,
      "manage"
    )
    if (!member) return "no_workspace_access"
    await ctx.db.patch(attempt._id, { state: "completed" })
    await ctx.db.replace(registration._id, {
      ...commonFields(registration),
      status: "claimed",
      owner: args.owner,
      workspaceId: args.workspaceId,
      scope: scopes,
      claimedAt: args.now,
    })
    await recordAuditEvent(
      ctx,
      args.workspaceId,
      { kind: "user", userId: args.owner },
      {
        operation: "agentRegistration.claim",
        registrationId: registration._id,
        scope: scopes,
      }
    )
    return "claimed"
  },
})

/** The fields of a WorkOS user that show a verified email. */
const VerifiedWorkosUser = Schema.Struct({
  email: Schema.String,
  email_verified: Schema.Literal(true),
})
const isVerifiedWorkosUser = Schema.is(VerifiedWorkosUser)

/** Reads the verified email of a WorkOS user, or null when it is not verified. */
export async function verifiedEmail(userId: string): Promise<string | null> {
  const response = await fetch(
    `https://api.workos.com/user_management/users/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${workosApiKey()}` } }
  )
  if (!response.ok) throw new Error("Could not read the signed-in user")
  const user: unknown = await response.json()
  return isVerifiedWorkosUser(user) ? user.email.toLowerCase() : null
}

/**
 * Confirms a claim on the claim page. The signed-in user must own the email
 * the agent named and type the code the agent showed. The agent then gets
 * `scopes` access to `workspaceId` and nothing else.
 */
export const confirmClaim = action({
  args: {
    attemptToken: v.string(),
    userCode: v.string(),
    workspaceId: v.id("workspaces"),
    scopes: v.array(agentScopeValidator),
  },
  returns: v.union(
    completeResult,
    v.literal("invalid_scopes"),
    v.literal("unverified_email")
  ),
  handler: async (
    ctx,
    args
  ): Promise<
    Infer<typeof completeResult> | "invalid_scopes" | "unverified_email"
  > => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthenticated")
    const email = await verifiedEmail(identity.subject)
    if (!email) return "unverified_email"
    return ctx.runMutation(internal.agentRegistrations.completeClaim, {
      attemptTokenDigest: await sha256(args.attemptToken),
      userCodeDigest: await keyedDigest(codeKey(), args.userCode.trim()),
      owner: identity.tokenIdentifier,
      email,
      workspaceId: args.workspaceId,
      scopes: args.scopes,
      now: Date.now(),
    })
  },
})

/** Stores a 1-hour access token for a claimed registration. */
async function issueAccessToken(
  ctx: MutationCtx,
  registration: Doc<"agentRegistrations"> & { status: "claimed" },
  accessTokenDigest: string,
  now: number
) {
  const expiresAt = now + ACCESS_TOKEN_LIFETIME_MS
  await ctx.db.insert("agentGrants", {
    workspaceId: registration.workspaceId,
    owner: registration.owner,
    digest: accessTokenDigest,
    scope: registration.scope,
    state: "active",
    expiresAt,
    registrationId: registration._id,
  })
  return expiresAt
}

const pollResult = v.union(
  v.object({ status: v.literal("expired") }),
  v.object({ status: v.literal("pending") }),
  v.object({ status: v.literal("slow_down") }),
  v.object({ status: v.literal("used") }),
  v.object({
    status: v.literal("issued"),
    registrationId: v.id("agentRegistrations"),
    email: v.string(),
    scopes: v.array(agentScopeValidator),
    expiresAt: v.number(),
  })
)

/**
 * The claim grant: the agent polls with its claim token until the user
 * claims. The first poll after the claim gets the tokens; the claim token
 * cannot get tokens again.
 */
export const pollClaim = internalMutation({
  args: {
    claimTokenDigest: v.string(),
    accessTokenDigest: v.string(),
    now: v.number(),
  },
  returns: pollResult,
  handler: async (ctx, args): Promise<Infer<typeof pollResult>> => {
    const registration = await ctx.db
      .query("agentRegistrations")
      .withIndex("by_claimTokenDigest", (q) =>
        q.eq("claimTokenDigest", args.claimTokenDigest)
      )
      .unique()
    if (!registration) return { status: "expired" }
    if (registration.status === "revoked") return { status: "used" }
    if (registration.status === "claimed") {
      if (registration.claimTokenUsedAt !== undefined) return { status: "used" }
      const expiresAt = await issueAccessToken(
        ctx,
        registration,
        args.accessTokenDigest,
        args.now
      )
      await ctx.db.patch(registration._id, { claimTokenUsedAt: args.now })
      return {
        status: "issued",
        registrationId: registration._id,
        email: registration.loginHint,
        scopes: [...grantedScopes(registration.scope)],
        expiresAt,
      }
    }
    if (registration.claimExpiresAt <= args.now) return { status: "expired" }
    const attempts = await ctx.db
      .query("agentClaimAttempts")
      .withIndex("by_registrationId", (q) =>
        q.eq("registrationId", registration._id)
      )
      .collect()
    if (!attempts.some((a) => a.state === "open" && a.expiresAt > args.now))
      return { status: "expired" }
    const tooSoon =
      registration.lastPolledAt !== undefined &&
      args.now - registration.lastPolledAt < POLL_INTERVAL_SECONDS * 1000
    await ctx.db.patch(registration._id, { lastPolledAt: args.now })
    return { status: tooSoon ? "slow_down" : "pending" }
  },
})

const exchangeResult = v.union(
  v.object({ status: v.literal("invalid") }),
  v.object({
    status: v.literal("issued"),
    scopes: v.array(agentScopeValidator),
    expiresAt: v.number(),
  })
)

/** The JWT-bearer grant, after convex/http.ts has verified the assertion. */
export const exchangeAssertion = internalMutation({
  args: {
    registrationId: v.string(),
    accessTokenDigest: v.string(),
    now: v.number(),
  },
  returns: exchangeResult,
  handler: async (ctx, args): Promise<Infer<typeof exchangeResult>> => {
    const id = ctx.db.normalizeId("agentRegistrations", args.registrationId)
    const registration = id && (await ctx.db.get(id))
    if (!registration || registration.status !== "claimed")
      return { status: "invalid" }
    const expiresAt = await issueAccessToken(
      ctx,
      registration,
      args.accessTokenDigest,
      args.now
    )
    return {
      status: "issued",
      scopes: [...grantedScopes(registration.scope)],
      expiresAt,
    }
  },
})

/** RFC 7009 revocation of one access token. Unknown tokens are ignored. */
export const revokeAccessToken = internalMutation({
  args: { digest: v.string() },
  returns: v.null(),
  handler: async (ctx, { digest }) => {
    const grant = await ctx.db
      .query("agentGrants")
      .withIndex("by_digest", (q) => q.eq("digest", digest))
      .unique()
    if (grant?.state === "active")
      await ctx.db.patch(grant._id, { state: "revoked" })
    return null
  },
})

const newAttemptResult = v.union(
  v.object({ status: v.literal("invalid_claim_token") }),
  v.object({ status: v.literal("claimed_or_in_flight") }),
  v.object({ status: v.literal("claim_expired") }),
  v.object({ status: v.literal("rate_limited") }),
  v.object({
    status: v.literal("initiated"),
    registrationId: v.id("agentRegistrations"),
    claimAttemptId: v.id("agentClaimAttempts"),
    expiresAt: v.number(),
  })
)

/**
 * Starts a new claim attempt with a new code and link, for example after
 * the previous code expired. The previous link stops working. The email
 * must be the one the registration was made for: a different email needs
 * a new registration.
 */
export const newClaimAttempt = internalMutation({
  args: {
    claimTokenDigest: v.string(),
    email: v.string(),
    attemptTokenDigest: v.string(),
    userCodeDigest: v.string(),
    now: v.number(),
  },
  returns: newAttemptResult,
  handler: async (ctx, args): Promise<Infer<typeof newAttemptResult>> => {
    const registration = await ctx.db
      .query("agentRegistrations")
      .withIndex("by_claimTokenDigest", (q) =>
        q.eq("claimTokenDigest", args.claimTokenDigest)
      )
      .unique()
    if (!registration || registration.loginHint !== args.email)
      return { status: "invalid_claim_token" }
    if (registration.status !== "pending")
      return { status: "claimed_or_in_flight" }
    if (registration.claimExpiresAt <= args.now)
      return { status: "claim_expired" }
    const attempts = await ctx.db
      .query("agentClaimAttempts")
      .withIndex("by_registrationId", (q) =>
        q.eq("registrationId", registration._id)
      )
      .take(MAX_CLAIM_ATTEMPTS)
    if (attempts.length >= MAX_CLAIM_ATTEMPTS) return { status: "rate_limited" }
    for (const attempt of attempts)
      if (attempt.state === "open")
        await ctx.db.patch(attempt._id, { state: "replaced" })
    const expiresAt = args.now + CLAIM_ATTEMPT_MS
    const claimAttemptId = await ctx.db.insert("agentClaimAttempts", {
      registrationId: registration._id,
      attemptTokenDigest: args.attemptTokenDigest,
      userCodeDigest: args.userCodeDigest,
      expiresAt,
      failedTries: 0,
      state: "open",
    })
    return {
      status: "initiated",
      registrationId: registration._id,
      claimAttemptId,
      expiresAt,
    }
  },
})

const connectedAgentValidator = v.object({
  _id: v.id("agentRegistrations"),
  email: v.string(),
  status: v.union(v.literal("claimed"), v.literal("revoked")),
  scopes: v.optional(v.array(agentScopeValidator)),
  claimedAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
})

/** The agents the signed-in user connected to a workspace, newest first. */
export const listForWorkspace = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(connectedAgentValidator),
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    const member = await requireMembership(ctx, workspaceId, "manage")
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Invalid page size")
    const result = await ctx.db
      .query("agentRegistrations")
      .withIndex("by_workspaceId_and_owner", (q) =>
        q.eq("workspaceId", workspaceId).eq("owner", member.userId)
      )
      .order("desc")
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.flatMap(
        (r): Array<Infer<typeof connectedAgentValidator>> => {
          if (r.status === "claimed")
            return [
              {
                _id: r._id,
                email: r.loginHint,
                status: "claimed",
                scopes: [...grantedScopes(r.scope)],
                claimedAt: r.claimedAt,
              },
            ]
          if (r.status === "revoked")
            return [
              {
                _id: r._id,
                email: r.loginHint,
                status: "revoked",
                revokedAt: r.revokedAt,
              },
            ]
          return []
        }
      ),
    }
  },
})

/**
 * Revokes a connected agent. Its identity assertion and every access token
 * issued to it stop working (see convex/lib/agentGrant.ts).
 */
export const revokeRegistration = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    registrationId: v.id("agentRegistrations"),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, registrationId }) => {
    const member = await requireMembership(ctx, workspaceId, "manage")
    const registration = await ctx.db.get(registrationId)
    if (
      !registration ||
      registration.status !== "claimed" ||
      registration.workspaceId !== workspaceId ||
      registration.owner !== member.userId
    )
      throw new Error("Agent not found")
    await ctx.db.replace(registration._id, {
      ...commonFields(registration),
      status: "revoked",
      owner: registration.owner,
      workspaceId: registration.workspaceId,
      revokedAt: Date.now(),
    })
    await recordAuditEvent(
      ctx,
      workspaceId,
      { kind: "user", userId: member.userId },
      { operation: "agentRegistration.revoke", registrationId }
    )
    return null
  },
})

/** Registrations per provider revocation transaction. */
const PROVIDER_REVOKE_BATCH = 100

const providerRevokeArgs = v.object({
  issuer: v.string(),
  subject: v.string(),
  /** Only registrations created up to this time are affected. */
  cutoff: v.number(),
  now: v.number(),
})

/**
 * Revokes one page of a provider user's registrations made up to `cutoff`,
 * then schedules the next page. The index sorts by status, so claimed
 * registrations come first. A claimed registration is revoked, with its
 * access tokens (see convex/lib/agentGrant.ts). A pending one expires, so
 * nobody can claim it.
 */
async function revokeProviderPage(
  ctx: MutationCtx,
  args: Infer<typeof providerRevokeArgs>,
  cursor: string | null
) {
  const page = await ctx.db
    .query("agentRegistrations")
    .withIndex(
      "by_providerIssuer_and_providerSubject_and_status_and_loginHint",
      (q) =>
        q
          .eq("provider.issuer", args.issuer)
          .eq("provider.subject", args.subject)
    )
    .paginate({ numItems: PROVIDER_REVOKE_BATCH, cursor })
  for (const registration of page.page) {
    if (registration._creationTime > args.cutoff) continue
    if (registration.status === "pending") {
      if (registration.claimExpiresAt > args.now)
        await ctx.db.patch(registration._id, { claimExpiresAt: args.now })
      continue
    }
    if (registration.status !== "claimed") continue
    await ctx.db.replace(registration._id, {
      ...commonFields(registration),
      status: "revoked",
      owner: registration.owner,
      workspaceId: registration.workspaceId,
      revokedAt: args.now,
    })
    await recordAuditEvent(
      ctx,
      registration.workspaceId,
      { kind: "provider", issuer: args.issuer },
      {
        operation: "agentRegistration.revoke",
        registrationId: registration._id,
      }
    )
  }
  if (!page.isDone)
    await ctx.scheduler.runAfter(
      0,
      internal.agentRegistrations.revokeByProviderPage,
      { ...args, cursor: page.continueCursor }
    )
}

/**
 * Handles a provider's assertion-revoked security event: every
 * registration that the provider user made before the event stops working.
 * A repeated event (same `jti`) changes nothing.
 */
export const revokeByProvider = internalMutation({
  args: {
    ...providerRevokeArgs.fields,
    jti: v.string(),
    replayExpiresAt: v.number(),
  },
  returns: v.union(v.literal("duplicate"), v.literal("started")),
  handler: async (ctx, { jti, replayExpiresAt, ...args }) => {
    if (!(await recordJti(ctx, args.issuer, jti, replayExpiresAt)))
      return "duplicate"
    await revokeProviderPage(ctx, args, null)
    return "started"
  },
})

/** The next page of a provider revocation. */
export const revokeByProviderPage = internalMutation({
  args: { ...providerRevokeArgs.fields, cursor: v.string() },
  returns: v.null(),
  handler: async (ctx, { cursor, ...args }) => {
    await revokeProviderPage(ctx, args, cursor)
    return null
  },
})
