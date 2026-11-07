import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { WorkspaceUsage } from "@/components/workspace-usage"
import { LoadingRows } from "@/components/loading-rows"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/usage"
)({
  component: UsageSection,
})

function UsageSection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  return workspace ? (
    <WorkspaceUsage key={workspace._id} workspaceId={workspace._id} />
  ) : (
    <LoadingRows label="Loading" />
  )
}
