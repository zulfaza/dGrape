import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { WorkspacePages } from "@/components/workspace-pages"
import { LoadingRows } from "@/components/loading-rows"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/pages"
)({
  component: PagesSection,
})

function PagesSection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  return workspace ? (
    <WorkspacePages key={workspace._id} workspaceId={workspace._id} />
  ) : (
    <LoadingRows label="Loading" />
  )
}
