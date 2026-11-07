import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { usePublishWorkspaceName } from "@/components/workspace-name"
import { WorkspaceRoleProvider } from "@/components/workspace-role"

export const Route = createFileRoute("/dashboard/workspaces_/$workspaceId")({
  component: WorkspaceLayout,
  errorComponent: () => (
    <main className="p-6">
      Could not load this workspace. Check your access and try again.
    </main>
  ),
})

/** Loads the workspace and gives its role to the section the sidebar selects. */
function WorkspaceLayout() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  usePublishWorkspaceName(workspace?.name)
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-8">
      <WorkspaceRoleProvider role={workspace?.role ?? null}>
        <Outlet />
      </WorkspaceRoleProvider>
    </main>
  )
}
