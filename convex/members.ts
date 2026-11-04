import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "./_generated/dataModel"
import { mutation, query, type MutationCtx } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import { recordAuditEvent } from "./lib/auditEvents"
import {
  workspaceRoleValidator,
  type WorkspaceRole,
} from "./lib/workspaceRoles"

/**
 * Member management. Only owners list, change or remove members. A workspace
 * always keeps at least one owner.
 *
 * A role change replaces the membership row. Agent credentials and connected
 * agents made before the current row stop working (see
 * convex/lib/agentGrant.ts), so a member who is demoted and then promoted
 * again does not get old agent access back.
 */

const memberValidator = v.object({
  userId: v.string(),
  role: workspaceRoleValidator,
  email: v.union(v.string(), v.null()),
  isYou: v.boolean(),
})

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(memberValidator),
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    const caller = await requireMembership(ctx, workspaceId, "manage")
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Page size must be between 1 and 50")
    const result = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) => q.eq("workspaceId", workspaceId))
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map((member) => ({
        userId: member.userId,
        role: member.role,
        email: member.email ?? null,
        isYou: member.userId === caller.userId,
      })),
    }
  },
})

/** The member `userId`, when the caller may manage the workspace. */
async function managedMember(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  userId: string
) {
  const caller = await requireMembership(ctx, workspaceId, "manage")
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (q) =>
      q.eq("workspaceId", workspaceId).eq("userId", userId)
    )
    .unique()
  if (!member) throw new Error("Member not found")
  return { caller, member }
}

/** Throws when `member` is the last owner of the workspace. */
async function keepAnOwner(ctx: MutationCtx, member: Doc<"workspaceMembers">) {
  if (member.role !== "owner") return
  const owners = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_role", (q) =>
      q.eq("workspaceId", member.workspaceId).eq("role", "owner")
    )
    .take(2)
  if (owners.length < 2) throw new Error("A workspace needs at least one owner")
}

export const setRole = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    userId: v.string(),
    role: workspaceRoleValidator,
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, userId, role }) => {
    const { caller, member } = await managedMember(ctx, workspaceId, userId)
    if (member.role === role) return null
    if (role !== "owner") await keepAnOwner(ctx, member)
    await replaceRole(ctx, member, role)
    await recordAuditEvent(
      ctx,
      workspaceId,
      { kind: "user", userId: caller.userId },
      { operation: "member.setRole", userId, role }
    )
    return null
  },
})

/** A new row, so that agent access made before the change stops working. */
async function replaceRole(
  ctx: MutationCtx,
  member: Doc<"workspaceMembers">,
  role: WorkspaceRole
) {
  const { _id, _creationTime, ...fields } = member
  await ctx.db.delete(_id)
  await ctx.db.insert("workspaceMembers", { ...fields, role })
}

export const remove = mutation({
  args: { workspaceId: v.id("workspaces"), userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { workspaceId, userId }) => {
    const { caller, member } = await managedMember(ctx, workspaceId, userId)
    await keepAnOwner(ctx, member)
    await ctx.db.delete(member._id)
    await recordAuditEvent(
      ctx,
      workspaceId,
      { kind: "user", userId: caller.userId },
      { operation: "member.remove", userId }
    )
    return null
  },
})
