import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  query,
  mutation,
} from "./_generated/server"
import { requireMembership, requireUserId } from "./lib/auth"
import { recordAuditEvent } from "./lib/auditEvents"
import { safeLabel, secretOwner, secretState } from "./lib/secretDomain"
import type { Doc } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"

export async function requireSecretOwner(
  ctx: QueryCtx,
  secret: Doc<"secretRefs">
) {
  await requireMembership(ctx, secret.workspaceId, "manage")
  if (secret.createdBy !== (await requireUserId(ctx)))
    throw new Error("Secret access denied")
}
export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      id: v.id("secretRefs"),
      label: v.string(),
      owner: secretOwner,
      revision: v.number(),
      status: v.union(
        v.literal("pending"),
        v.literal("ready"),
        v.literal("deleting"),
        v.literal("deleted")
      ),
      canManage: v.boolean(),
    })
  ),
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    const member = await requireMembership(ctx, workspaceId, "manage")
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 100
    )
      throw new Error("Page size must be between 1 and 100")
    const secrets = await ctx.db
      .query("secretRefs")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .paginate(paginationOpts)
    return {
      ...secrets,
      page: secrets.page
        .filter(
          (s) =>
            s.owner.kind === "workspace" || s.owner.userId === member.userId
        )
        .map((s) => ({
          id: s._id,
          label: s.label,
          owner: s.owner,
          revision: s.revision,
          status: s.state.kind,
          canManage: s.createdBy === member.userId,
        })),
    }
  },
})
/** Reserve metadata first. Plaintext is never a mutation argument. */
export const prepare = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    label: v.string(),
    private: v.boolean(),
  },
  returns: v.id("secretRefs"),
  handler: async (ctx, args) => {
    const member = await requireMembership(ctx, args.workspaceId, "manage")
    const id = await ctx.db.insert("secretRefs", {
      workspaceId: args.workspaceId,
      label: safeLabel(args.label),
      createdBy: member.userId,
      owner: args.private
        ? { kind: "user", userId: member.userId }
        : { kind: "workspace" },
      revision: 1,
      state: {
        kind: "pending",
        writeUntil: 0,
        name: crypto.randomUUID(),
        previousName: null,
      },
    })
    await recordAuditEvent(
      ctx,
      args.workspaceId,
      { kind: "user", userId: member.userId },
      { operation: "secret.prepare", secretId: id }
    )
    return id
  },
})
export const rotate = mutation({
  args: { secretRef: v.id("secretRefs"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const secret = await ctx.db.get(args.secretRef)
    if (!secret) throw new Error("Secret access denied")
    await requireSecretOwner(ctx, secret)
    if (secret.revision !== args.revision || secret.state.kind !== "ready")
      throw new Error("Secret changed. Refresh and try again")
    await ctx.db.patch(secret._id, {
      revision: secret.revision + 1,
      state: {
        kind: "pending",
        writeUntil: 0,
        name: crypto.randomUUID(),
        previousName: secret.state.name,
      },
    })
    await recordAuditEvent(
      ctx,
      secret.workspaceId,
      { kind: "user", userId: secret.createdBy },
      {
        operation: "secret.rotate",
        secretId: secret._id,
        revision: secret.revision + 1,
      }
    )
    return null
  },
})
export const metadata = internalQuery({
  args: { secretRef: v.id("secretRefs") },
  returns: v.object({
    workspaceId: v.id("workspaces"),
    owner: secretOwner,
    revision: v.number(),
    state: secretState,
  }),
  handler: async (ctx, { secretRef }) => {
    const secret = await ctx.db.get(secretRef)
    if (!secret) throw new Error("Secret access denied")
    await requireSecretOwner(ctx, secret)
    return {
      workspaceId: secret.workspaceId,
      owner: secret.owner,
      revision: secret.revision,
      state: secret.state,
    }
  },
})
export const finish = internalMutation({
  args: {
    secretRef: v.id("secretRefs"),
    revision: v.number(),
    name: v.string(),
    objectId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const secret = await ctx.db.get(args.secretRef)
    if (
      !secret ||
      secret.revision !== args.revision ||
      secret.state.kind !== "pending" ||
      secret.state.name !== args.name
    )
      throw new Error("Secret changed")
    await ctx.db.patch(secret._id, {
      state: { kind: "ready", name: args.name, objectId: args.objectId },
    })
    return null
  },
})
export const beginDelete = mutation({
  args: { secretRef: v.id("secretRefs"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const secret = await ctx.db.get(args.secretRef)
    if (!secret) throw new Error("Secret access denied")
    await requireSecretOwner(ctx, secret)
    if (secret.revision !== args.revision) throw new Error("Secret changed")
    // Pending writes must complete before deletion. A retry can reconcile them.
    if (secret.state.kind === "pending") {
      if (secret.state.writeUntil > Date.now())
        throw new Error("A credential save is in progress. Retry later")
      await ctx.db.patch(secret._id, {
        state: {
          kind: "deleting",
          names: [
            secret.state.name,
            ...(secret.state.previousName ? [secret.state.previousName] : []),
          ],
        },
      })
    }
    if (secret.state.kind === "ready")
      await ctx.db.patch(secret._id, {
        state: { kind: "deleting", names: [secret.state.name] },
      })
    if (secret.state.kind === "pending" || secret.state.kind === "ready")
      await recordAuditEvent(
        ctx,
        secret.workspaceId,
        { kind: "user", userId: secret.createdBy },
        { operation: "secret.delete", secretId: secret._id }
      )
    return null
  },
})
export const finishDelete = internalMutation({
  args: { secretRef: v.id("secretRefs"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const secret = await ctx.db.get(args.secretRef)
    if (secret?.revision === args.revision && secret.state.kind === "deleting")
      await ctx.db.patch(secret._id, { state: { kind: "deleted" } })
    return null
  },
})

/** A short lease prevents concurrent HTTP writes and pending cancellation. */
export const claimWrite = internalMutation({
  args: { secretRef: v.id("secretRefs"), revision: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const secret = await ctx.db.get(args.secretRef)
    if (!secret) throw new Error("Secret access denied")
    await requireSecretOwner(ctx, secret)
    if (
      secret.revision !== args.revision ||
      secret.state.kind !== "pending" ||
      secret.state.writeUntil > Date.now()
    )
      throw new Error("A credential save is in progress. Retry later")
    await ctx.db.patch(secret._id, {
      state: { ...secret.state, writeUntil: Date.now() + 60000 },
    })
    return null
  },
})
