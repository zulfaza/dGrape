import { createFileRoute } from "@tanstack/react-router"
import { usePaginatedQuery, useQuery } from "convex/react"
import { useState } from "react"
import { api } from "../../../../convex/_generated/api"
import type { Id } from "../../../../convex/_generated/dataModel"
import { CollectionRecords } from "@/components/collection-records"
import { CreateCollectionDialog } from "@/components/create-collection-dialog"
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

export const Route = createFileRoute(
  "/dashboard/workspaces_/$workspaceId/data"
)({ component: DataSection })

function DataSection() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  const { results, status, loadMore } = usePaginatedQuery(
    api.workspaces.listCollections,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const [selectedCollection, setSelectedCollection] =
    useState<Id<"collections"> | null>(null)

  if (selectedCollection)
    return (
      <CollectionRecords
        key={selectedCollection}
        collectionId={selectedCollection}
        onClose={() => setSelectedCollection(null)}
      />
    )

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
            Collections hold your records. Open one to view, add, or edit them.
          </p>
        </div>
        {results.length > 0 && (
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground tabular-nums">
              {results.length === 1
                ? "1 collection"
                : `${results.length} collections`}
            </span>
            {workspace && (
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
          <EmptyContent>
            {workspace && (
              <CreateCollectionDialog workspaceId={workspace._id} />
            )}
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="divide-y">
          {results.map((collection) => (
            <li
              key={collection._id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"
            >
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="truncate text-base font-semibold">
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
              <Button
                variant="outline"
                onClick={() => setSelectedCollection(collection._id)}
              >
                Open
                <span className="sr-only"> {collection.name}</span>
              </Button>
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
