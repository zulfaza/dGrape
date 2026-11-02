import { v, type Infer } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import { action, internalMutation, query } from "./_generated/server"
import { keyedDigest, sha256 } from "./lib/agentAuthCrypto"
import { codeKey, workosApiKey } from "./lib/agentAuthConfig"
import { agentScopeValidator } from "./lib/agentScope"
import { requireUserId } from "./lib/auth"
import {
  CLAIM_ATTEMPT_MS,
  CLAIM_WINDOW_MS,
  MAX_CODE_TRIES,
  MAX_PENDING_PER_EMAIL,
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
    scope: agentScopeValidator,
    now: v.number(),
  },
  returns: completeResult,
  handler: async (ctx, args): Promise<Infer<typeof completeResult>> => {
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
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.owner)
      )
      .unique()
    if (!member || member.role !== "owner") return "no_workspace_access"
    await ctx.db.patch(attempt._id, { state: "completed" })
    await ctx.db.replace(registration._id, {
      status: "claimed",
      loginHint: registration.loginHint,
      claimTokenDigest: registration.claimTokenDigest,
      claimExpiresAt: registration.claimExpiresAt,
      owner: args.owner,
      workspaceId: args.workspaceId,
      scope: args.scope,
      claimedAt: args.now,
    })
    return "claimed"
  },
})

/** Reads the verified email of a WorkOS user, or null when it is not verified. */
async function verifiedEmail(userId: string): Promise<string | null> {
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
 * `scope` access to `workspaceId` and nothing else.
 */
export const confirmClaim = action({
  args: {
    attemptToken: v.string(),
    userCode: v.string(),
    workspaceId: v.id("workspaces"),
    scope: agentScopeValidator,
  },
  returns: v.union(completeResult, v.literal("unverified_email")),
  handler: async (
    ctx,
    args
  ): Promise<Infer<typeof completeResult> | "unverified_email"> => {
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
      scope: args.scope,
      now: Date.now(),
    })
  },
})
