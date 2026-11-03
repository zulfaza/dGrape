import { ConvexError } from "convex/values"
import type { QueryCtx } from "../_generated/server"
import {
  grantedScopes,
  missingScopeMessage,
  missingScopes,
  type AgentScope,
} from "./agentScope"

/**
 * Returns the workspace and scopes of a credential, or null when the credential
 * is unknown, revoked, expired, or its owner has lost the workspace.
 */
export async function resolveGrant(ctx: QueryCtx, digest: string, now: number) {
  const grant = await ctx.db
    .query("agentGrants")
    .withIndex("by_digest", (q) => q.eq("digest", digest))
    .unique()
  if (!grant || grant.state !== "active" || grant.expiresAt <= now) return null
  if (grant.registrationId) {
    // Revoking a registration stops every token issued to it.
    const registration = await ctx.db.get(grant.registrationId)
    if (registration?.status !== "claimed") return null
  }
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", grant.workspaceId).eq("userId", grant.owner)
    )
    .unique()
  if (!member || member.role !== "owner") return null
  return {
    grantId: grant._id,
    owner: grant.owner,
    registrationId: grant.registrationId ?? null,
    workspaceId: grant.workspaceId,
    scopes: grantedScopes(grant.scope),
  }
}

export type Grant = NonNullable<Awaited<ReturnType<typeof resolveGrant>>>

export type ScopedGrant =
  | { status: "ok"; grant: Grant }
  | { status: "denied" }
  | { status: "missing_scope"; missing: Array<AgentScope> }

/**
 * Resolves a credential and checks that it holds every scope in `needs`.
 * "denied": the credential is unknown, revoked, or expired.
 */
export async function resolveScopedGrant(
  ctx: QueryCtx,
  digest: string,
  now: number,
  needs: ReadonlyArray<AgentScope>
): Promise<ScopedGrant> {
  const grant = await resolveGrant(ctx, digest, now)
  if (!grant) return { status: "denied" }
  const missing = missingScopes(grant.scopes, needs)
  if (missing.length > 0) return { status: "missing_scope", missing }
  return { status: "ok", grant }
}

/** Status that convex/lib/agentRoute.ts sends for a refused operation. */
export type AgentFailureStatus = 400 | 403 | 409

/**
 * Runs `operate` for a valid credential that holds every scope in `needs`, in
 * the caller's transaction. A plain Error from the
 * operation becomes a ConvexError that agentRoute maps to a status: 403 when
 * the message says "denied", 409 when it says "conflict", otherwise 400.
 */
export async function withGrant<A>(
  ctx: QueryCtx,
  digest: string,
  now: number,
  needs: ReadonlyArray<AgentScope>,
  operate: (grant: Grant) => Promise<A>
): Promise<A> {
  const scoped = await resolveScopedGrant(ctx, digest, now, needs)
  if (scoped.status === "denied")
    throw new ConvexError({ status: 403, message: "Credential access denied" })
  if (scoped.status === "missing_scope")
    throw new ConvexError({
      status: 403,
      message: missingScopeMessage(scoped.missing),
    })
  const grant = scoped.grant
  try {
    return await operate(grant)
  } catch (error) {
    if (error instanceof ConvexError || !(error instanceof Error)) throw error
    const status: AgentFailureStatus = error.message.includes("denied")
      ? 403
      : error.message.includes("conflict")
        ? 409
        : 400
    throw new ConvexError({ status, message: error.message })
  }
}
