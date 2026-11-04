import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v } from "convex/values"
import { query } from "./_generated/server"
import { requireMembership } from "./lib/auth"
import { auditEventFields } from "./lib/auditEvents"

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
          (event.actor.kind === "user"
            ? event.actor.userId
            : event.actor.owner) === member.userId,
      })),
    }
  },
})
