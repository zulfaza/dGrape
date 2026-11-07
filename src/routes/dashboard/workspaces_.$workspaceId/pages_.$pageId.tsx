import { Schema } from "effect"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { EllipsisVertical, History, Pencil } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { LoadingRows } from "@/components/loading-rows"
import { DashboardEditor } from "@/components/dashboard-editor"
import { PageBlocksGrid } from "@/components/dashboard-grid"
import { PageHeader } from "@/components/page-header"
import { useWorkspaceCan } from "@/components/workspace-role"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({ edit: Schema.optional(Schema.Boolean) })
  ),
})

/** One dashboard as people read it. `?edit=true` opens edit mode. */
function DashboardView() {
  const { workspaceId, pageId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
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
  if (canWrite && search.edit === true)
    return (
      <DashboardEditor
        key={page._id}
        workspaceId={workspace._id}
        page={page}
        onExit={() => void navigate({ search: {} })}
      />
    )
  const editLink = canWrite && (
    <Button asChild variant="outline">
      <Link
        to="/dashboard/workspaces/$workspaceId/pages/$pageId"
        params={{ workspaceId, pageId }}
        search={{ edit: true }}
      >
        <Pencil aria-hidden />
        Edit
      </Link>
    </Button>
  )
  const actions = (
    <>
      {editLink}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Dashboard menu">
            <EllipsisVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link
              to="/dashboard/workspaces/$workspaceId/pages"
              params={{ workspaceId }}
              search={{ revisions: page._id }}
            >
              <History aria-hidden />
              Revisions
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
  const published = page.publishedRevision
  return (
    <article className="flex flex-col gap-6">
      <PageHeader
        title={version?.definition.title ?? page.title}
        description={
          published === undefined
            ? `Draft, revision ${page.revision}. Not published yet.`
            : page.revision > published
              ? `Revision ${published}. Draft revision ${page.revision} is not published.`
              : `Revision ${published}`
        }
        actions={actions}
      />
      {version === null || version.definition.blocks.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>This dashboard is empty</EmptyTitle>
              <EmptyDescription>
                Add stats, charts, tables, or text to it.
              </EmptyDescription>
            </EmptyHeader>
            {editLink && <EmptyContent>{editLink}</EmptyContent>}
          </Empty>
        </div>
      ) : (
        <PageBlocksGrid
          workspaceId={workspace._id}
          stored={{ pageId: page._id, revision: version.revision }}
          blocks={version.definition.blocks}
        />
      )}
    </article>
  )
}
