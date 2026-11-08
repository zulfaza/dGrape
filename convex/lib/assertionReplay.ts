import { v } from "convex/values"
import type { MutationCtx } from "../_generated/server"

/**
 * Replay protection for provider-signed JWTs (identity assertions and
 * security event tokens). Each `jti` is recorded per issuer until the token
 * can no longer pass verification. Record it in the same transaction that
 * acts on the token, so two concurrent requests cannot both use it.
 */

export const assertionReplayValidator = v.object({
  issuer: v.string(),
  jti: v.string(),
  /** After this time the token is expired, so the row can be deleted. */
  expiresAt: v.number(),
})

/**
 * Records a `jti`. Returns false when the issuer already used it, so the
 * caller must refuse the token with `replay_detected`.
 */
export async function recordJti(
  ctx: MutationCtx,
  issuer: string,
  jti: string,
  expiresAt: number
) {
  const used = await ctx.db
    .query("assertionReplays")
    .withIndex("by_issuer_and_jti", (q) =>
      q.eq("issuer", issuer).eq("jti", jti)
    )
    .first()
  if (used) return false
  await ctx.db.insert("assertionReplays", { issuer, jti, expiresAt })
  return true
}
