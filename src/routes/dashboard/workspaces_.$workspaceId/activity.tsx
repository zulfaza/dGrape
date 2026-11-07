import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { WorkspaceActivity } from "@/components/workspace-activity"
import { LoadingRows } from "@/components/loading-rows"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/activity"
)({
  component: ActivitySection,
})

function ActivitySection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  return workspace ? (
    <WorkspaceActivity key={workspace._id} workspaceId={workspace._id} />
  ) : (
    <LoadingRows label="Loading" />
  )
}
