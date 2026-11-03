import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { AgentAccess, AgentAccessBoundary } from "@/components/agent-access"
import { ConnectedAgents } from "@/components/connected-agents"
import { WorkspaceConnections } from "@/components/workspace-connections"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/connections"
)({
  component: ConnectionsSection,
})

function ConnectionsSection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  if (!workspace) return null
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <WorkspaceConnections workspaceId={workspace._id} />
      <div className="flex flex-col gap-6">
        <AgentAccessBoundary key={workspace._id}>
          <AgentAccess workspaceId={workspace._id} />
          <ConnectedAgents workspaceId={workspace._id} />
        </AgentAccessBoundary>
      </div>
    </div>
  )
}
