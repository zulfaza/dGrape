import { usePaginatedQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { grantedScopes } from "../../convex/lib/agentScope"
import type { AuditActor, AuditEvent } from "../../convex/lib/auditEvents"
import { scopeSummary } from "@/components/scope-picker"
import { Button } from "@/components/ui/button"
import { LoadingRows } from "@/components/loading-rows"
import { PageHeader } from "@/components/page-header"

const PAGE_SIZE = 20

/** Who made a change, from the viewer's point of view. */
function actorLabel(actor: AuditActor, byViewer: boolean) {
  const owner = byViewer ? "Your" : "A member's"
  if (actor.kind === "user") return byViewer ? "You" : "A member"
  if (actor.kind === "scheduler") return "A schedule"
  if (actor.kind === "provider") return "An agent provider"
  return actor.registrationId
    ? `${owner} connected agent`
    : `${owner} agent token`
}

/** What changed. Events hold no values, so this names only the change. */
function describe(event: AuditEvent): string {
  switch (event.operation) {
    case "workspace.create":
      return "created the workspace"
    case "workspace.setBudgets":
      return "changed the workspace budgets"
    case "collection.create":
      return "created a collection"
    case "collection.addField":
      return `added a field (schema version ${event.version})`
    case "collection.renameField":
      return `renamed a field (schema version ${event.version})`
    case "collection.planMigration":
      return "planned a schema migration"
    case "collection.startMigration":
      return "started a schema migration"
    case "collection.cancelMigration":
      return "cancelled a schema migration"
    case "record.create":
      return "added a record"
    case "record.update":
      return `changed a record (revision ${event.revision})`
    case "record.delete":
      return "deleted a record"
    case "query.save":
      return `saved a query (revision ${event.revision})`
    case "page.save":
      return `saved a page (revision ${event.revision})`
    case "page.publish":
      return `published a page (revision ${event.revision})`
    case "page.rollback":
      return `rolled back a page (revision ${event.revision})`
    case "recipe.publish":
      return "published a recipe version"
    case "recipe.setRunAccess":
      return event.allowed
        ? "let a member run a recipe"
        : "stopped a member from running a recipe"
    case "schedule.create":
      return "scheduled a recipe"
    case "schedule.update":
      return `changed a schedule (revision ${event.revision})`
    case "schedule.setEnabled":
      return event.enabled ? "resumed a schedule" : "paused a schedule"
    case "run.trigger":
      return "started a recipe run"
    case "run.retry":
      return "retried a recipe run"
    case "run.cancel":
      return "cancelled a recipe run"
    case "artifact.upload":
      return "uploaded a file"
    case "artifact.delete":
      return "deleted a file"
    case "connection.create":
      return "added a connection"
    case "connection.grantUse":
      return event.allowed
        ? "let a member use a connection"
        : "stopped a member from using a connection"
    case "connection.remove":
      return "removed a connection"
    case "secret.prepare":
      return "added a credential"
    case "secret.rotate":
      return "replaced a credential"
    case "secret.delete":
      return "deleted a credential"
    case "agentGrant.create":
      return `created an agent token (${scopeSummary(grantedScopes(event.scope))})`
    case "agentGrant.revoke":
      return "revoked an agent token"
    case "agentRegistration.claim":
      return "connected an agent"
    case "agentRegistration.revoke":
      return "disconnected an agent"
    case "member.invite":
      return `invited a member as ${event.role}`
    case "member.revokeInvite":
      return "revoked an invite"
    case "member.join":
      return `joined as ${event.role}`
    case "member.setRole":
      return `changed a member's role to ${event.role}`
    case "member.remove":
      return "removed a member"
  }
}

/**
 * The change history of a workspace, newest first. It loads one bounded page
 * at a time, and shows who made each change and what changed, never values.
 */
export function WorkspaceActivity({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.auditEvents.list,
    { workspaceId },
    { initialNumItems: PAGE_SIZE }
  )

  return (
    <section aria-label="Activity" className="flex flex-col gap-6">
      <PageHeader
        title="Activity"
        description="Changes that you and your agents made. Values are not kept here."
      />
      {status === "LoadingFirstPage" ? (
        <LoadingRows label="Loading activity" />
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol className="divide-y rounded-lg border bg-card">
          {results.map((item) => (
            <li key={item._id} className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="text-sm">
                <span className="font-medium">
                  {actorLabel(item.actor, item.byViewer)}
                </span>{" "}
                {describe(item.event)}
              </span>
              <time
                dateTime={new Date(item._creationTime).toISOString()}
                className="text-xs text-muted-foreground tabular-nums"
              >
                {new Date(item._creationTime).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      )}
      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => loadMore(PAGE_SIZE)}
        >
          Load more
        </Button>
      )}
      {status === "LoadingMore" && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading more…
        </p>
      )}
    </section>
  )
}
