import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { useRef, useState } from "react"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { Button } from "./ui/button"
import { PagePreview, revisionAction } from "./page-preview"
import { ConfirmDialog } from "./confirm-dialog"
import { useNewDashboard } from "./new-dashboard"
import { useWorkspaceCan } from "@/components/workspace-role"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { toast } from "@/components/ui/toast"
import { LoadingRows } from "@/components/loading-rows"
import { PageHeader } from "@/components/page-header"
import { errorMessage } from "@/lib/error-message"

/**
 * All dashboards of a workspace. `revisionsPageId` also opens the revision
 * history of that dashboard, where people preview, publish, and roll back.
 * Dashboards are edited in place on their own page.
 */
export function WorkspacePages({
  workspaceId,
  revisionsPageId,
}: {
  workspaceId: Id<"workspaces">
  revisionsPageId?: string
}) {
  const canWrite = useWorkspaceCan("write")
  const newDashboard = useNewDashboard(workspaceId)
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.list,
    { workspaceId },
    { initialNumItems: 20 }
  )
  // The page may be past the loaded rows, so look it up by id; the query
  // also checks that it is in this workspace.
  const requested = useQuery(
    api.pages.view,
    revisionsPageId ? { workspaceId, pageId: revisionsPageId } : "skip"
  )
  const newButton = canWrite && (
    <Button disabled={newDashboard.pending} onClick={newDashboard.create}>
      New dashboard
    </Button>
  )
  return (
    <section className="flex flex-col gap-6" aria-label="Dashboards">
      <PageHeader
        title="Dashboards"
        description="Stats, charts, tables, and text built from your data."
        actions={newButton}
      />
      {requested && (
        <PageRevisions
          key={requested.page._id}
          workspaceId={workspaceId}
          page={requested.page}
        />
      )}
      {status === "LoadingFirstPage" && <LoadingRows label="Loading pages" />}
      {status === "Exhausted" && results.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No dashboards yet</EmptyTitle>
            <EmptyDescription>
              A dashboard shows stats, charts, tables, and text from your data.
            </EmptyDescription>
          </EmptyHeader>
          {newButton && <EmptyContent>{newButton}</EmptyContent>}
        </Empty>
      )}
      {results.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {results.map((page) => (
            <li key={page._id}>
              <Link
                to="/dashboard/workspaces/$workspaceId/pages/$pageId"
                params={{ workspaceId, pageId: page._id }}
                className="flex w-full items-center gap-4 px-4 py-3 text-left outline-none first:rounded-t-lg last:rounded-b-lg hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className="min-w-0 flex-1 truncate font-medium"
                  title={page.title}
                >
                  {page.title}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  Revision {page.revision} ·{" "}
                  {page.publishedRevision
                    ? `Revision ${page.publishedRevision} published`
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
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(20)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more pages"}
        </Button>
      )}
    </section>
  )
}

/** The revision history of one dashboard, with publish and rollback. */
function PageRevisions({
  workspaceId,
  page,
}: {
  workspaceId: Id<"workspaces">
  page: Doc<"pages">
}) {
  const publish = useMutation(api.pages.publish)
  const rollback = useMutation(api.pages.rollback)
  const history = usePaginatedQuery(
    api.pages.history,
    { pageId: page._id },
    { initialNumItems: 20 }
  )
  const [previewRevision, setPreviewRevision] = useState<number | null>(null)
  const [confirmRollback, setConfirmRollback] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const running = useRef(false)
  const publishedRevision = page.publishedRevision ?? null

  /** Publish a newer revision or roll back to an older one. */
  async function select(revision: number) {
    const action = revisionAction(revision, publishedRevision)
    if (action === "published" || running.current) return
    running.current = true
    setPending(true)
    try {
      const args = {
        pageId: page._id,
        revision,
        expectedRevision: page.revision,
        expectedPublishedRevision: publishedRevision,
      }
      await (action === "rollback" ? rollback(args) : publish(args))
      toast.success(
        action === "rollback"
          ? `Rolled back to revision ${revision}`
          : `Published revision ${revision}`
      )
    } catch (error) {
      toast.error(
        errorMessage(error, "Reload the page and try again."),
        "Could not change the published revision"
      )
    } finally {
      running.current = false
      setPending(false)
    }
  }

  return (
    <section
      aria-label={`Revisions of ${page.title}`}
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Revisions · {page.title}</h2>
        <Button asChild variant="outline">
          <Link
            to="/dashboard/workspaces/$workspaceId/pages/$pageId"
            params={{ workspaceId, pageId: page._id }}
          >
            Open dashboard
          </Link>
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Preview a revision to publish it or roll back to it.
      </p>
      {history.status === "LoadingFirstPage" && (
        <p role="status">Loading history…</p>
      )}
      <ul className="divide-y">
        {history.results.map((version) => (
          <li
            key={version._id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span>
              Revision {version.revision}
              {publishedRevision === version.revision ? " (published)" : ""}
            </span>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => setPreviewRevision(version.revision)}
            >
              Preview revision {version.revision}
            </Button>
          </li>
        ))}
      </ul>
      {history.status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => history.loadMore(20)}>
          Load older revisions
        </Button>
      )}
      {history.status === "LoadingMore" && (
        <p role="status">Loading history…</p>
      )}
      {previewRevision !== null && (
        <PagePreview
          key={previewRevision}
          workspaceId={workspaceId}
          pageId={page._id}
          revision={previewRevision}
          publishedRevision={publishedRevision}
          pending={pending}
          select={(revision) => {
            if (revisionAction(revision, publishedRevision) === "rollback")
              setConfirmRollback(revision)
            else void select(revision)
          }}
          close={() => setPreviewRevision(null)}
        />
      )}
      <ConfirmDialog
        open={confirmRollback !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmRollback(null)
        }}
        onConfirm={() => {
          if (confirmRollback !== null) void select(confirmRollback)
        }}
        title={`Roll back to revision ${confirmRollback ?? ""}?`}
        description="Viewers see this older revision until you publish another."
        confirmLabel="Roll back"
      />
    </section>
  )
}
