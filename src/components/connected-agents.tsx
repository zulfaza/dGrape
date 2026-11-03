import { useMutation, usePaginatedQuery } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { scopeSummary } from "@/components/scope-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"

/**
 * Agents connected through auth.md registration (the /claim page). Revoking
 * one stops its identity assertion and every token issued to it.
 */
export function ConnectedAgents({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.agentRegistrations.listForWorkspace,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const revoke = useMutation(api.agentRegistrations.revokeRegistration)
  const [saving, setSaving] = useState(false)

  async function remove(registrationId: Id<"agentRegistrations">) {
    setSaving(true)
    try {
      await revoke({ workspaceId, registrationId })
      toast.success("Agent disconnected")
    } catch {
      toast.error("Could not disconnect the agent")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="agents-heading" className="flex flex-col gap-2">
      <h3 id="agents-heading" className="text-sm font-semibold">
        Connected agents
      </h3>
      <p className="text-sm text-muted-foreground">
        Agents that you approved with a code on the connect page.
      </p>
      {status === "LoadingFirstPage" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading agents…
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No connected agents.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {results.map((agent) => (
            <li
              key={agent._id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {agent.email}
                </span>
                <span className="text-xs text-muted-foreground">
                  {agent.status === "claimed" && agent.scopes && agent.claimedAt
                    ? `${scopeSummary(agent.scopes)} · connected ${new Date(agent.claimedAt).toLocaleDateString()}`
                    : agent.revokedAt
                      ? `Disconnected ${new Date(agent.revokedAt).toLocaleDateString()}`
                      : ""}
                </span>
              </div>
              {agent.status === "claimed" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saving}
                  onClick={() => remove(agent._id)}
                >
                  Disconnect
                </Button>
              ) : (
                <Badge variant="secondary">Disconnected</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => loadMore(20)}
        >
          Load more
        </Button>
      )}
    </section>
  )
}
