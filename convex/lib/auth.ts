import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

type AuthContext = {
  auth: {
    getUserIdentity: () => Promise<{ tokenIdentifier: string } | null>;
  };
};

export async function requireUserId(ctx: AuthContext): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Unauthenticated");
  return identity.tokenIdentifier;
}

export async function requireMembership(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  const userId = await requireUserId(ctx);
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId).eq("userId", userId))
    .unique();
  if (!member) throw new Error("Workspace access denied");
  return member;
}
