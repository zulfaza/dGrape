import { createFileRoute, Link } from "@tanstack/react-router"
import { usePaginatedQuery, useQuery } from "convex/react"
import { Schema } from "effect"
import { ChevronRight } from "lucide-react"
import { api } from "../../../../convex/_generated/api"
import { CollectionRecords } from "@/components/collection-records"
import { CreateCollectionDialog } from "@/components/create-collection-dialog"
import { useWorkspaceCan } from "@/components/workspace-role"
import { Mascot } from "@/components/mascot"
import { FIELD_TYPE_LABELS } from "@/lib/field-types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { LoadingRows } from "@/components/loading-rows"

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/data"
)({
  component: DataSection,
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({ collection: Schema.optional(Schema.String) })
  ),
})

function DataSection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  const canWrite = useWorkspaceCan("write")
  const { results, status, loadMore } = usePaginatedQuery(
    api.workspaces.listCollections,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const { collection: openId } = Route.useSearch()
  const navigate = Route.useNavigate()
  // The URL holds the open collection, so Back and shared links work. A
  // collection past the loaded pages is looked up by its id.
  const listed = openId && results.find((item) => item._id === openId)
  const found = useQuery(
    api.workspaces.findCollection,
    openId && !listed && workspace
      ? { workspaceId: workspace._id, collectionId: openId }
      : "skip"
  )
  const openCollectionId = listed ? listed._id : found

  if (openCollectionId)
    return (
      <CollectionRecords
        key={openCollectionId}
        collectionId={openCollectionId}
        onClose={() => void navigate({ search: {} })}
      />
    )
  if (openId && found === undefined)
    return <LoadingRows label="Loading collection" />

  return (
    <section
      aria-labelledby="collections-heading"
      className="rounded-lg border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 border-b px-5 py-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="collections-heading" className="text-xl font-semibold">
            Collections
          </h2>
          <p className="text-sm text-muted-foreground">
            Open a collection to view and edit its records.
          </p>
        </div>
        {results.length > 0 && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground tabular-nums">
              {results.length === 1
                ? "1 collection"
                : `${results.length} collections`}
            </span>
            {canWrite && workspace && (
              <CreateCollectionDialog workspaceId={workspace._id} />
            )}
          </div>
        )}
      </div>
      {status === "LoadingFirstPage" ? (
        <p role="status" className="px-5 py-6 text-muted-foreground">
          Loading collections…
        </p>
      ) : results.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia>
              <Mascot pose="wave" size={160} />
            </EmptyMedia>
            <EmptyTitle>Create your first collection</EmptyTitle>
            <EmptyDescription>
              Choose the fields each record has, such as company, salary, and
              applied. Your agent can then fill it in.
            </EmptyDescription>
          </EmptyHeader>
          {canWrite && workspace && (
            <EmptyContent>
              <CreateCollectionDialog workspaceId={workspace._id} />
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <ul className="divide-y">
          {results.map((collection) => (
            <li key={collection._id}>
              <Link
                to="."
                search={{ collection: collection._id }}
                className="flex items-center gap-4 px-5 py-4 outline-none last:rounded-b-lg hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <h3
                    className="truncate text-base font-semibold"
                    title={collection.name}
                  >
                    {collection.name}
                  </h3>
                  <ul aria-label="Fields" className="flex flex-wrap gap-1.5">
                    {collection.definition.fields.map((field) => (
                      <li key={field.id}>
                        <Badge variant="secondary">
                          {field.label}
                          <span className="text-muted-foreground">
                            {FIELD_TYPE_LABELS[field.type]}
                          </span>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <div className="border-t px-5 py-3">
          <Button variant="outline" onClick={() => loadMore(20)}>
            Load more
          </Button>
        </div>
      )}
      {status === "LoadingMore" && (
        <p role="status" className="border-t px-5 py-3">
          Loading more…
        </p>
      )}
    </section>
  )
}
