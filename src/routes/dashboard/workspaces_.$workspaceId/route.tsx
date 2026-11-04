import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { ChevronLeft } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { ExportDefinitionsButton } from "@/components/export-definitions-button"
import { PageHeader } from "@/components/page-header"

export const Route = createFileRoute("/dashboard/workspaces_/$workspaceId")({
  component: WorkspaceLayout,
  errorComponent: () => (
    <main className="p-6">
      Could not load this workspace. Check your access and try again.
    </main>
  ),
})

/** Workspace title above the section that the sidebar selects. */
function WorkspaceLayout() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-8">
      <div className="flex flex-col gap-3">
        <Link
          to="/dashboard/workspaces"
          className="inline-flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft aria-hidden className="size-4" />
          All workspaces
        </Link>
        <PageHeader
          title={workspace ? workspace.name : "Loading workspace…"}
          actions={
            workspace && (
              <ExportDefinitionsButton
                key={workspace._id}
                workspace={workspace}
              />
            )
          }
        />
      </div>
      <Outlet />
    </main>
  )
}
