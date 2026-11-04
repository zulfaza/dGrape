import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v, type Infer } from "convex/values"
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
} from "./lib/agentRegistration"

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

/** Starts a service_auth registration with its first claim attempt. */
export const register = internalMutation({
  args: {
    loginHint: v.string(),
    claimTokenDigest: v.string(),
    attemptTokenDigest: v.string(),
    userCodeDigest: v.string(),
    now: v.number(),
  },
  returns: registerResult,
  handler: async (ctx, args): Promise<Infer<typeof registerResult>> => {
    const open = await ctx.db
      .query("agentRegistrations")
      .withIndex("by_loginHint_and_status_and_claimExpiresAt", (q) =>
        q
          .eq("loginHint", args.loginHint)
          .eq("status", "pending")
          .gt("claimExpiresAt", args.now)
      )
      .take(MAX_PENDING_PER_EMAIL)
    if (open.length >= MAX_PENDING_PER_EMAIL) return { status: "rate_limited" }
    const claimExpiresAt = args.now + CLAIM_WINDOW_MS
    const attemptExpiresAt = args.now + CLAIM_ATTEMPT_MS
    const registrationId = await ctx.db.insert("agentRegistrations", {
      status: "pending",
      loginHint: args.loginHint,
      claimTokenDigest: args.claimTokenDigest,
      claimExpiresAt,
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
    return {
      status: "open",
      email: claim.registration.loginHint,
      expiresAt: claim.attempt.expiresAt,
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
      status: "claimed",
      loginHint: registration.loginHint,
      claimTokenDigest: registration.claimTokenDigest,
      claimExpiresAt: registration.claimExpiresAt,
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

/** Reads the verified email of a WorkOS user, or null when it is not verified. */
export async function verifiedEmail(userId: string): Promise<string | null> {
  const response = await fetch(
    `https://api.workos.com/user_management/users/${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${workosApiKey()}` } }
  )
  if (!response.ok) throw new Error("Could not read the signed-in user")
  const user: unknown = await response.json()
  if (typeof user !== "object" || user === null) return null
  const email = "email" in user ? user.email : undefined
  const verified = "email_verified" in user ? user.email_verified : undefined
  return typeof email === "string" && verified === true
    ? email.toLowerCase()
    : null
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
      status: "revoked",
      loginHint: registration.loginHint,
      claimTokenDigest: registration.claimTokenDigest,
      claimExpiresAt: registration.claimExpiresAt,
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
