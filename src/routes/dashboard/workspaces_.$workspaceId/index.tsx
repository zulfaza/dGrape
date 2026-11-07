import { createFileRoute, Link } from "@tanstack/react-router"
import { usePaginatedQuery, useQuery } from "convex/react"
import { ChevronRight, Plus } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { LoadingRows } from "@/components/loading-rows"
import { Mascot } from "@/components/mascot"
import { PageHeader } from "@/components/page-header"
import { useWorkspaceCan } from "@/components/workspace-role"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export const Route = createFileRoute("/dashboard/workspaces_/$workspaceId/")({
  component: WorkspaceHome,
})

/** A workspace opens on its dashboards; settings live behind Settings. */
function WorkspaceHome() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  const canWrite = useWorkspaceCan("write")
  const pages = usePaginatedQuery(
    api.pages.list,
    workspace ? { workspaceId: workspace._id } : "skip",
    { initialNumItems: 20 }
  )
  if (!workspace) return <LoadingRows label="Loading workspace" />
  const newDashboard = canWrite && (
    <Button asChild>
      <Link
        to="/dashboard/workspaces/$workspaceId/pages"
        params={{ workspaceId }}
        search={{ new: true }}
      >
        <Plus aria-hidden />
        New dashboard
      </Link>
    </Button>
  )
  return (
    <section aria-label="Dashboards" className="flex flex-col gap-6">
      <PageHeader
        title={workspace.name}
        description="Dashboards in this workspace."
        actions={pages.results.length > 0 && newDashboard}
      />
      {pages.status === "LoadingFirstPage" ? (
        <LoadingRows label="Loading dashboards" />
      ) : pages.results.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <Mascot pose="chart" size={140} />
              </EmptyMedia>
              <EmptyTitle>Make your first dashboard</EmptyTitle>
              <EmptyDescription>
                Show text, tables, metrics, and charts from your collections.
              </EmptyDescription>
            </EmptyHeader>
            {newDashboard && <EmptyContent>{newDashboard}</EmptyContent>}
          </Empty>
        </div>
      ) : (
        <ul className="divide-y overflow-hidden rounded-lg border bg-card">
          {pages.results.map((page) => (
            <li key={page._id}>
              <Link
                to="/dashboard/workspaces/$workspaceId/pages/$pageId"
                params={{ workspaceId, pageId: page._id }}
                className="flex items-center gap-4 px-5 py-4 outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span
                  className="min-w-0 flex-1 truncate font-medium"
                  title={page.title}
                >
                  {page.title}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {page.publishedRevision
                    ? `Revision ${page.publishedRevision}`
                    : "Not published"}
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {pages.status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => pages.loadMore(20)}
        >
          Load more
        </Button>
      )}
      {pages.status === "LoadingMore" && (
        <LoadingRows label="Loading more dashboards" rows={1} />
      )}
    </section>
  )
}
