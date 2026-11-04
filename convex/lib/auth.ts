import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { roleAllows, type WorkspaceAccess } from "./workspaceRoles"

type AuthContext = {
  auth: {
    getUserIdentity: () => Promise<{ tokenIdentifier: string } | null>
  }
}

export async function requireUserId(ctx: AuthContext): Promise<string> {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Unauthenticated")
  return identity.tokenIdentifier
}

/**
 * The membership of `userId` when its role gives `access`, otherwise null.
 * Use it for a principal that is not the caller, such as the owner of an
 * agent credential or the creator of a recipe.
 */
export async function memberWithAccess(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  userId: string,
  access: WorkspaceAccess
): Promise<Doc<"workspaceMembers"> | null> {
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .unique()
  return member && roleAllows(member.role, access) ? member : null
}

/**
 * The membership of the signed-in caller. Throws when the caller is not a
 * member, or when the role does not give `access`.
 */
export async function requireMembership(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  access: WorkspaceAccess
): Promise<Doc<"workspaceMembers">> {
  const userId = await requireUserId(ctx)
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .unique()
  if (!member) throw new Error("Workspace access denied")
  if (!roleAllows(member.role, access))
    throw new Error("Workspace permission denied for your role")
  return member
}
