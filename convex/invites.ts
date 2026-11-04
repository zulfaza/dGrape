import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v, type Infer } from "convex/values"
import { internal } from "./_generated/api"
import { action, internalMutation, mutation, query } from "./_generated/server"
import { verifiedEmail } from "./agentRegistrations"
import { randomToken, sha256 } from "./lib/agentAuthCrypto"
import { memberWithAccess, requireMembership, requireUserId } from "./lib/auth"
import { recordAuditEvent } from "./lib/auditEvents"
import { inviteRoleValidator } from "./lib/workspaceRoles"

/**
 * Workspace invites. An owner invites an email address as editor or viewer
 * and shares the link once. Only a signed-in user whose verified email is
 * that address can accept. The link token has 256 bits of entropy and only
 * its SHA-256 digest is stored.
 */

const INVITE_DAYS = 7
const MAX_PENDING_INVITES = 50

/** Lowercase email, or null when it does not look like one address. */
function normalizeEmail(raw: string) {
  const email = raw.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null
}

/**
 * Creates an invite and returns its token once. A new invite for the same
 * email replaces the pending one, so the old link stops working.
 */
export const create = action({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: inviteRoleValidator,
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const invitedBy = await requireUserId(ctx)
    const email = normalizeEmail(args.email)
    if (!email) throw new Error("Enter one valid email address")
    const token = randomToken("inv")
    await ctx.runMutation(internal.invites.insert, {
      workspaceId: args.workspaceId,
      email,
      role: args.role,
      invitedBy,
      tokenDigest: await sha256(token),
    })
    return token
  },
})

export const insert = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: inviteRoleValidator,
    invitedBy: v.string(),
    tokenDigest: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (
      !(await memberWithAccess(ctx, args.workspaceId, args.invitedBy, "manage"))
    )
      throw new Error("Workspace permission denied for your role")
    const previous = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspaceId_and_email", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("email", args.email)
      )
      .unique()
    if (previous) await ctx.db.delete(previous._id)
    else {
      const pending = await ctx.db
        .query("workspaceInvites")
        .withIndex("by_workspaceId_and_email", (q) =>
          q.eq("workspaceId", args.workspaceId)
        )
        .take(MAX_PENDING_INVITES)
      // Expired invites do not count. Delete them to make room.
      const now = Date.now()
      const expired = pending.filter((invite) => invite.expiresAt <= now)
      for (const invite of expired) await ctx.db.delete(invite._id)
      if (pending.length - expired.length >= MAX_PENDING_INVITES)
        throw new Error(
          `A workspace has at most ${MAX_PENDING_INVITES} pending invites`
        )
    }
    const inviteId = await ctx.db.insert("workspaceInvites", {
      ...args,
      expiresAt: Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000,
    })
    await recordAuditEvent(
      ctx,
      args.workspaceId,
      { kind: "user", userId: args.invitedBy },
      { operation: "member.invite", inviteId, role: args.role }
    )
    return null
  },
})

/** Pending invites, for owners. An invite past `expiresAt` cannot be used. */
export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      _id: v.id("workspaceInvites"),
      email: v.string(),
      role: inviteRoleValidator,
      expiresAt: v.number(),
    })
  ),
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    await requireMembership(ctx, workspaceId, "manage")
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Page size must be between 1 and 50")
    const result = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_workspaceId_and_email", (q) =>
        q.eq("workspaceId", workspaceId)
      )
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map(({ _id, email, role, expiresAt }) => ({
        _id,
        email,
        role,
        expiresAt,
      })),
    }
  },
})

export const revoke = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    inviteId: v.id("workspaceInvites"),
  },
  returns: v.null(),
  handler: async (ctx, { workspaceId, inviteId }) => {
    const member = await requireMembership(ctx, workspaceId, "manage")
    const invite = await ctx.db.get(inviteId)
    if (!invite || invite.workspaceId !== workspaceId) return null
    await ctx.db.delete(inviteId)
    await recordAuditEvent(
      ctx,
      workspaceId,
      { kind: "user", userId: member.userId },
      { operation: "member.revokeInvite", inviteId }
    )
    return null
  },
})

const acceptResult = v.union(
  v.object({ status: v.literal("joined"), workspaceId: v.id("workspaces") }),
  /** The link is unknown, revoked, used or expired. */
  v.object({ status: v.literal("invalid") }),
  /** The signed-in user's verified email is not the invited email. */
  v.object({ status: v.literal("wrong_account") }),
  v.object({ status: v.literal("unverified_email") })
)

/** Accepts an invite for the signed-in user. */
export const accept = action({
  args: { token: v.string() },
  returns: acceptResult,
  handler: async (ctx, { token }): Promise<Infer<typeof acceptResult>> => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Unauthenticated")
    const email = await verifiedEmail(identity.subject)
    if (!email) return { status: "unverified_email" }
    return ctx.runMutation(internal.invites.redeem, {
      tokenDigest: await sha256(token),
      userId: identity.tokenIdentifier,
      email,
    })
  },
})

/**
 * Adds the user as a member with the invited role and deletes the invite. A
 * user who is already a member keeps their role.
 */
export const redeem = internalMutation({
  args: { tokenDigest: v.string(), userId: v.string(), email: v.string() },
  returns: acceptResult,
  handler: async (ctx, args): Promise<Infer<typeof acceptResult>> => {
    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_tokenDigest", (q) => q.eq("tokenDigest", args.tokenDigest))
      .unique()
    if (!invite) return { status: "invalid" }
    // An invite stops working when its owner is no longer an owner.
    const inviter = await memberWithAccess(
      ctx,
      invite.workspaceId,
      invite.invitedBy,
      "manage"
    )
    if (!inviter || invite.expiresAt <= Date.now()) {
      await ctx.db.delete(invite._id)
      return { status: "invalid" }
    }
    if (invite.email !== args.email) return { status: "wrong_account" }
    await ctx.db.delete(invite._id)
    const workspaceId = invite.workspaceId
    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", workspaceId).eq("userId", args.userId)
      )
      .unique()
    if (existing) return { status: "joined", workspaceId }
    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId: args.userId,
      role: invite.role,
      email: args.email,
    })
    await recordAuditEvent(
      ctx,
      workspaceId,
      { kind: "user", userId: args.userId },
      { operation: "member.join", userId: args.userId, role: invite.role }
    )
    return { status: "joined", workspaceId }
  },
})
