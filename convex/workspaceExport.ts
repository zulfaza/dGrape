import { v } from "convex/values"
import { internalQuery, query } from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import { requireMembership } from "./lib/auth"
import {
  exportWorkspace,
  workspaceExportResultValidator,
  workspaceExportValidator,
} from "./lib/workspaceExport"

/**
 * Workspace definition exports; convex/lib/workspaceExport.ts builds them.
 * `now` is the caller's clock for `exportedAt`, because a query cannot read
 * one.
 */

/** For a workspace member in the dashboard. */
export const definitions = query({
  args: { workspaceId: v.id("workspaces"), now: v.number() },
  returns: workspaceExportResultValidator,
  handler: async (ctx, { workspaceId, now }) => {
    await requireMembership(ctx, workspaceId)
    return exportWorkspace(ctx, workspaceId, now)
  },
})

/**
 * For an agent credential. It needs each read scope of the exported
 * definitions: data.read (collections and saved queries), jobs.read
 * (recipes and schedules), and pages.read (pages).
 */
export const agentDefinitions = internalQuery({
  args: { digest: v.string(), now: v.number() },
  returns: workspaceExportValidator,
  handler: (ctx, { digest, now }) =>
    withGrant(
      ctx,
      digest,
      now,
      ["data.read", "jobs.read", "pages.read"],
      async (grant) => {
        const result = await exportWorkspace(ctx, grant.workspaceId, now)
        if (result.kind === "tooLarge") throw new Error(result.message)
        return result.document
      }
    ),
})
