import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { Pencil } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { LoadingRows } from "@/components/loading-rows"
import { PageBlockView } from "@/components/page-preview"
import { PageHeader } from "@/components/page-header"
import { useWorkspaceCan } from "@/components/workspace-role"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/pages_/$pageId"
)({
  component: DashboardView,
})

/** One dashboard as people read it, with a way into the editor. */
function DashboardView() {
  const { workspaceId, pageId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  const viewed = useQuery(
    api.pages.view,
    workspace ? { workspaceId: workspace._id, pageId } : "skip"
  )
  const canWrite = useWorkspaceCan("write")
  if (!workspace || viewed === undefined)
    return <LoadingRows label="Loading dashboard" />
  if (viewed === null)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Dashboard not found</EmptyTitle>
          <EmptyDescription>
            It was deleted, or it belongs to another workspace.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  const { page, version } = viewed
  const editLink = canWrite && (
    <Button asChild variant="outline">
      <Link
        to="/dashboard/workspaces/$workspaceId/pages"
        params={{ workspaceId }}
        search={{ edit: page._id }}
      >
        <Pencil aria-hidden />
        Edit
      </Link>
    </Button>
  )
  return (
    <article className="flex flex-col gap-6">
      <PageHeader
        title={page.title}
        description={
          page.publishedRevision
            ? `Revision ${page.publishedRevision}`
            : `Draft, revision ${page.revision}. Not published yet.`
        }
        actions={editLink}
      />
      {version === null || version.definition.blocks.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>This dashboard is empty</EmptyTitle>
              <EmptyDescription>
                Add text, tables, metrics, or charts to it.
              </EmptyDescription>
            </EmptyHeader>
            {editLink && <EmptyContent>{editLink}</EmptyContent>}
          </Empty>
        </div>
      ) : (
        <div className="flex flex-col gap-6 break-words [&_a]:underline [&_h1]:text-2xl [&_h2]:text-xl [&_pre]:overflow-auto [&_ul]:list-disc [&_ul]:pl-5">
          {version.definition.blocks.map((block, index) => (
            <PageBlockView
              key={index}
              workspaceId={workspace._id}
              stored={{ pageId: page._id, revision: version.revision }}
              blockIndex={index}
              block={block}
            />
          ))}
        </div>
      )}
    </article>
  )
}
