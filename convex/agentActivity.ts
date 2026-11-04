import { paginationResultValidator } from "convex/server"
import { v } from "convex/values"
import { internalQuery } from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import type { AgentScope } from "./lib/agentScope"
import {
  auditActorValidator,
  auditEventValidator,
  type AuditEvent,
} from "./lib/auditEvents"

/**
 * The activity history for agent credentials. convex/http.ts calls this
 * after it decodes the request with convex/lib/agentActivityTransport.ts.
 */

/**
 * The scope that a credential needs to see an event: the read scope of the
 * changed object. Null: no agent sees it. Credential events stay in the
 * dashboard, because they name other credentials and their scopes.
 */
const READ_SCOPE: Record<AuditEvent["operation"], AgentScope | null> = {
  "workspace.create": "data.read",
  "workspace.setBudgets": "data.read",
  "collection.create": "data.read",
  "collection.addField": "data.read",
  "collection.renameField": "data.read",
  "record.create": "data.read",
  "record.update": "data.read",
  "record.delete": "data.read",
  "query.save": "data.read",
  "page.save": "pages.read",
  "page.publish": "pages.read",
  "page.rollback": "pages.read",
  "recipe.publish": "jobs.read",
  "recipe.setRunAccess": "jobs.read",
  "schedule.create": "jobs.read",
  "schedule.update": "jobs.read",
  "schedule.setEnabled": "jobs.read",
  "run.trigger": "jobs.read",
  "run.retry": "jobs.read",
  "run.cancel": "jobs.read",
  // Connections and their secrets show with connections_list (jobs.read).
  "connection.create": "jobs.read",
  "connection.grantUse": "jobs.read",
  "connection.remove": "jobs.read",
  "secret.prepare": "jobs.read",
  "secret.rotate": "jobs.read",
  "secret.delete": "jobs.read",
  "agentGrant.create": null,
  "agentGrant.revoke": null,
  "agentRegistration.claim": null,
  "agentRegistration.revoke": null,
  // Member events stay in the dashboard: they name other users.
  "member.invite": null,
  "member.revokeInvite": null,
  "member.join": null,
  "member.setRole": null,
  "member.remove": null,
}

/**
 * The workspace's events, newest first. Each page reads `numItems` events and
 * keeps only those whose read scope the credential holds, so a page can have
 * fewer items, or none, while `isDone` is false.
 */
export const list = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: paginationResultValidator(
    v.object({
      id: v.id("auditEvents"),
      createdAt: v.number(),
      actor: auditActorValidator,
      event: auditEventValidator,
    })
  ),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, [], async (grant) => {
      const result = await ctx.db
        .query("auditEvents")
        .withIndex("by_workspaceId", (q) =>
          q.eq("workspaceId", grant.workspaceId)
        )
        .order("desc")
        .paginate({ numItems: args.numItems, cursor: args.cursor })
      return {
        isDone: result.isDone,
        continueCursor: result.continueCursor,
        page: result.page.flatMap((row) => {
          const scope = READ_SCOPE[row.event.operation]
          return scope !== null && grant.scopes.includes(scope)
            ? [
                {
                  id: row._id,
                  createdAt: row._creationTime,
                  actor: row.actor,
                  event: row.event,
                },
              ]
            : []
        }),
      }
    }),
})
