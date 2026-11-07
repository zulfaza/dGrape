import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { WorkspaceArtifacts } from "@/components/workspace-artifacts"
import { LoadingRows } from "@/components/loading-rows"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/artifacts"
)({
  component: ArtifactsSection,
})

function ArtifactsSection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  return workspace ? (
    <WorkspaceArtifacts key={workspace._id} workspaceId={workspace._id} />
  ) : (
    <LoadingRows label="Loading" />
  )
}
