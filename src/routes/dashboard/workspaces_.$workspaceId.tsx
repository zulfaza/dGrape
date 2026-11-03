import { createFileRoute, Link } from "@tanstack/react-router"
import { usePaginatedQuery, useQuery } from "convex/react"
import { ChevronLeft } from "lucide-react"
import { useState } from "react"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { AgentAccess, AgentAccessBoundary } from "@/components/agent-access"
import { ConnectedAgents } from "@/components/connected-agents"
import { WorkspacePages } from "@/components/workspace-pages"
import { WorkspaceConnections } from "@/components/workspace-connections"
import { WorkspaceArtifacts } from "@/components/workspace-artifacts"
import { CollectionRecords } from "@/components/collection-records"
import { CreateCollectionDialog } from "@/components/create-collection-dialog"
import { Mascot } from "@/components/mascot"
import { PageHeader } from "@/components/page-header"
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

export const Route = createFileRoute("/dashboard/workspaces_/$workspaceId")({
  component: WorkspacePage,
  errorComponent: () => (
    <main className="p-6">
      Could not load this workspace. Check your access and try again.
    </main>
  ),
})

const FIELD_TYPE_LABELS = {
  text: "Text",
  number: "Number",
  integer: "Integer / minor units",
  currency: "Currency code",
  boolean: "Yes / no",
}

function WorkspacePage() {
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
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-8">
        <CollectionRecords
          key={selectedCollection}
          collectionId={selectedCollection}
          onClose={() => setSelectedCollection(null)}
        />
      </main>
    )

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
          description="Collections hold your records. Open one to view, add, or edit them."
          actions={
            results.length > 0 && (
              <CreateCollectionDialog workspaceId={workspaceId} />
            )
          }
        />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section
          aria-labelledby="collections-heading"
          className="rounded-lg border bg-card"
        >
          <div className="flex items-baseline justify-between gap-4 border-b px-5 py-4">
            <h2 id="collections-heading" className="text-xl font-semibold">
              Collections
            </h2>
            {results.length > 0 && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {results.length === 1
                  ? "1 collection"
                  : `${results.length} collections`}
              </span>
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
                  Choose the fields each record has, such as company, salary,
                  and applied. Your agent can then fill it in.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <CreateCollectionDialog workspaceId={workspaceId} />
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
        {workspace && (
          <WorkspacePages key={workspace._id} workspaceId={workspace._id} />
        )}
        {workspace && <WorkspaceConnections workspaceId={workspace._id} />}
        {workspace && <WorkspaceArtifacts workspaceId={workspace._id} />}
        {workspace && (
          <AgentAccessBoundary key={workspace._id}>
            <AgentAccess workspaceId={workspace._id} />
            <ConnectedAgents workspaceId={workspace._id} />
          </AgentAccessBoundary>
        )}
      </div>
    </main>
  )
}
