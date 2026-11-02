import { v, type Infer } from "convex/values"
import { internalMutation } from "./_generated/server"
import {
  CLAIM_ATTEMPT_MS,
  CLAIM_WINDOW_MS,
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
