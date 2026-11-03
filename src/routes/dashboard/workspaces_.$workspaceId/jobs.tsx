import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { WorkspaceRecipes } from "@/components/workspace-recipes"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/jobs"
)({
  component: JobsSection,
})

function JobsSection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  return workspace ? (
    <WorkspaceRecipes key={workspace._id} workspaceId={workspace._id} />
  ) : null
}
