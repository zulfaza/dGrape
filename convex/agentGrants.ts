import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import { agentScopeValidator } from "./lib/agentScope"
import { resolveGrant } from "./lib/agentGrant"
import { requireMembership } from "./lib/auth"
import {
  collectionFieldValidator,
  collectionRecordValidator,
} from "./lib/collectionDomain"

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_ACTIVE_GRANTS = 10
const MAX_GRANT_DAYS = 30

const metadata = v.object({
  _id: v.id("agentGrants"),
  _creationTime: v.number(),
  expiresAt: v.number(),
  state: v.union(v.literal("active"), v.literal("revoked")),
  scope: agentScopeValidator,
})

export const insert = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    owner: v.string(),
    digest: v.string(),
    days: v.number(),
    scope: agentScopeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("userId", args.owner)
      )
      .unique()
    if (!member || member.role !== "owner") throw new Error("Access denied")
    if (
      !Number.isInteger(args.days) ||
      args.days < 1 ||
      args.days > MAX_GRANT_DAYS
    )
      throw new Error("Invalid duration")
    const now = Date.now()
    const active = await ctx.db
      .query("agentGrants")
      .withIndex("by_workspace_owner_state_expiresAt", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("owner", args.owner)
          .eq("state", "active")
          .gt("expiresAt", now)
      )
      .take(MAX_ACTIVE_GRANTS)
    if (active.length >= MAX_ACTIVE_GRANTS)
      throw new Error("Grant limit reached")
    await ctx.db.insert("agentGrants", {
      workspaceId: args.workspaceId,
      owner: args.owner,
      digest: args.digest,
      scope: args.scope,
      state: "active",
      expiresAt: now + args.days * DAY_MS,
    })
    return null
  },
})
export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(metadata),
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    const member = await requireMembership(ctx, workspaceId)
    if (
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50 ||
      !Number.isInteger(paginationOpts.numItems)
    )
      throw new Error("Invalid page size")
    const result = await ctx.db
      .query("agentGrants")
      .withIndex("by_workspace_owner", (q) =>
        q.eq("workspaceId", workspaceId).eq("owner", member.userId)
      )
      .order("desc")
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map(
        ({ _id, _creationTime, expiresAt, state, scope }) => ({
          _id,
          _creationTime,
          expiresAt,
          state,
          scope,
        })
      ),
    }
  },
})
export const revoke = mutation({
  args: { workspaceId: v.id("workspaces"), grantId: v.id("agentGrants") },
  returns: v.null(),
  handler: async (ctx, { workspaceId, grantId }) => {
    const member = await requireMembership(ctx, workspaceId)
    const grant = await ctx.db.get(grantId)
    if (
      !grant ||
      grant.workspaceId !== workspaceId ||
      grant.owner !== member.userId
    )
      throw new Error("Access denied")
    await ctx.db.patch(grantId, { state: "revoked" })
    return null
  },
})

const MAX_DESCRIBED_COLLECTIONS = 100

export const describe = internalQuery({
  args: { digest: v.string(), now: v.number() },
  returns: v.union(
    v.literal("denied"),
    v.object({
      workspace: v.object({ id: v.id("workspaces"), name: v.string() }),
      collections: v.array(
        v.object({
          id: v.id("collections"),
          name: v.string(),
          fields: v.array(collectionFieldValidator),
        })
      ),
      collectionsTruncated: v.boolean(),
    })
  ),
  handler: async (ctx, { digest, now }) => {
    const grant = await resolveGrant(ctx, digest, now)
    if (!grant) return "denied"
    const { workspaceId } = grant
    const workspace = await ctx.db.get(workspaceId)
    if (!workspace) return "denied"
    const collections = await ctx.db
      .query("collections")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .take(MAX_DESCRIBED_COLLECTIONS + 1)
    return {
      workspace: { id: workspace._id, name: workspace.name },
      collections: collections
        .slice(0, MAX_DESCRIBED_COLLECTIONS)
        .map(({ _id, name, definition }) => ({
          id: _id,
          name,
          fields: definition.fields,
        })),
      collectionsTruncated: collections.length > MAX_DESCRIBED_COLLECTIONS,
    }
  },
})

export const read = internalQuery({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
    now: v.number(),
  },
  returns: v.union(
    v.literal("denied"),
    v.literal("invalid"),
    paginationResultValidator(collectionRecordValidator)
  ),
  // Callers (convex/http.ts) validate limit and cursor size at the boundary.
  handler: async (ctx, args) => {
    const grant = await resolveGrant(ctx, args.digest, args.now)
    if (!grant) return "denied"
    const { workspaceId } = grant
    const id = ctx.db.normalizeId("collections", args.collectionId)
    if (!id) return "invalid"
    const collection = await ctx.db.get(id)
    if (!collection || collection.workspaceId !== workspaceId) return "denied"
    return ctx.db
      .query("collectionRecords")
      .withIndex("by_collection", (q) => q.eq("collectionId", id))
      .paginate({ cursor: args.cursor, numItems: args.limit })
  },
})
