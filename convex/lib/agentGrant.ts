import type { QueryCtx } from "../_generated/server"

/**
 * Returns the workspace and scope of a credential, or null when the credential
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
    workspaceId: grant.workspaceId,
    scope: grant.scope,
  }
}
