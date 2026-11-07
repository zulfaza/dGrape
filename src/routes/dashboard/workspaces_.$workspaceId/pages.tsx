import { Schema } from "effect"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "convex/react"
import { api } from "../../../../convex/_generated/api"
import { WorkspacePages } from "@/components/workspace-pages"
import { LoadingRows } from "@/components/loading-rows"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/pages"
)({
  component: PagesSection,
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({
      edit: Schema.optional(Schema.String),
      new: Schema.optional(Schema.Boolean),
    })
  ),
})

function PagesSection() {
  const { workspaceId } = Route.useParams()
  const search = Route.useSearch()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  return workspace ? (
    <WorkspacePages
      key={workspace._id}
      workspaceId={workspace._id}
      editPageId={search.edit}
      startNew={search.new === true}
    />
  ) : (
    <LoadingRows label="Loading" />
  )
}
