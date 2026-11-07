import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { WorkspaceMembers } from "@/components/workspace-members"
import { LoadingRows } from "@/components/loading-rows"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/members"
)({
  component: MembersSection,
})

function MembersSection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  if (!workspace) return <LoadingRows label="Loading" />
  if (workspace.role !== "owner")
    return (
      <p className="text-sm text-muted-foreground">
        Only workspace owners manage members and invites.
      </p>
    )
  return <WorkspaceMembers key={workspace._id} workspaceId={workspace._id} />
}
