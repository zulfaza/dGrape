import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { internalMutation, query } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import { AUDIT_RETENTION_DAYS, auditEventFields } from "./lib/auditEvents"

const auditEventDocument = v.object({
  _id: v.id("auditEvents"),
  _creationTime: v.number(),
  ...auditEventFields,
  /** True when the viewer made the change, directly or through an agent. */
  byViewer: v.boolean(),
})

/** The newest events of a workspace first, at most 50 for each page. */
export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(auditEventDocument),
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    const member = await requireMembership(ctx, workspaceId, "read")
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Page size must be between 1 and 50")
    const result = await ctx.db
      .query("auditEvents")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map((event) => ({
        ...event,
        byViewer:
          event.actor.kind === "user"
            ? event.actor.userId === member.userId
            : event.actor.kind === "agent" &&
              event.actor.owner === member.userId,
      })),
    }
  },
})

const DAY_MS = 24 * 60 * 60 * 1000
/** Events per prune transaction. */
const PRUNE_PAGE = 200

/**
 * Deletes a page of a workspace's events older than AUDIT_RETENTION_DAYS,
 * then schedules itself again until none is left. The daily run-history
 * prune (convex/runRetention.ts) starts it for each workspace.
 */
export const pruneWorkspace = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, { workspaceId }) => {
    const cutoff = Date.now() - AUDIT_RETENTION_DAYS * DAY_MS
    const expired = await ctx.db
      .query("auditEvents")
      .withIndex("by_workspaceId", (q) =>
        q.eq("workspaceId", workspaceId).lt("_creationTime", cutoff)
      )
      .take(PRUNE_PAGE)
    for (const event of expired) await ctx.db.delete(event._id)
    if (expired.length === PRUNE_PAGE)
      await ctx.scheduler.runAfter(0, internal.auditEvents.pruneWorkspace, {
        workspaceId,
      })
    return null
  },
})
