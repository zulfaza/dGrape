import { ArtifactPicker } from "./artifact-picker"
import { previewKind } from "../../convex/lib/artifactPreview"
import {
  useConvex,
  useMutation,
  usePaginatedQuery,
  useQuery,
} from "convex/react"
import { useEffect, useRef, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { PageDefinition } from "../../convex/lib/pageDomain"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { PageBlockView, PagePreview, revisionAction } from "./page-preview"
import { PageSourcePicker } from "./page-source-picker"
import { useWorkspaceCan } from "@/components/workspace-role"
import { Link } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
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

type Draft = {
  definition: PageDefinition
} & (
  | { kind: "new"; publishedRevision: null }
  | {
      kind: "saved"
      pageId: Id<"pages">
      revision: number
      publishedRevision: number | null
    }
)

/** `editPageId` opens that page in the editor, as a dashboard's Edit does. */
export function WorkspacePages({
  workspaceId,
  editPageId,
}: {
  workspaceId: Id<"workspaces">
  editPageId?: string
}) {
  return (
    <WorkspacePagesEditor
      key={workspaceId}
      workspaceId={workspaceId}
      editPageId={editPageId}
    />
  )
}

function WorkspacePagesEditor({
  workspaceId,
  editPageId,
}: {
  workspaceId: Id<"workspaces">
  editPageId?: string
}) {
  const client = useConvex()
  const canWrite = useWorkspaceCan("write")
  const save = useMutation(api.pages.save)
  const publish = useMutation(api.pages.publish)
  const rollback = useMutation(api.pages.rollback)
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.list,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, setPending] = useState(false)
  const running = useRef(false)
  const [message, setMessage] = useState("")
  const [artifactTitle, setArtifactTitle] = useState("")
  const [dirty, setDirty] = useState(false)
  const [previewRevision, setPreviewRevision] = useState<number | null>(null)
  const history = usePaginatedQuery(
    api.pages.history,
    draft?.kind === "saved" ? { pageId: draft.pageId } : "skip",
    { initialNumItems: 20 }
  )

  async function run(action: () => Promise<void>) {
    if (running.current) return
    running.current = true
    setPending(true)
    setMessage("")
    try {
      await action()
    } catch {
      setMessage(
        "Could not save. Check the title and blocks. If someone else changed this page, copy your edits and reopen it."
      )
    } finally {
      running.current = false
      setPending(false)
    }
  }
  function canLeave() {
    return !dirty || window.confirm("Discard unsaved changes?")
  }
  async function open(pageId: Id<"pages">, revision: number) {
    if (!canLeave()) return
    await run(async () => {
      const result = await client.query(api.pages.get, { pageId, revision })
      if (!result.version) throw new Error("Page version is unavailable")
      setDraft({
        kind: "saved",
        pageId,
        revision,
        publishedRevision: result.page.publishedRevision ?? null,
        definition: result.version.definition,
      })
      setDirty(false)
      setPreviewRevision(null)
    })
  }
  // Open the requested page once. It may be past the loaded rows, so look
  // it up by id; the query also checks that it is in this workspace.
  const opened = useRef(false)
  const requested = useQuery(
    api.pages.view,
    editPageId ? { workspaceId, pageId: editPageId } : "skip"
  )
  useEffect(() => {
    if (opened.current || !requested) return
    opened.current = true
    void open(requested.page._id, requested.page.revision)
  })
  function change(definition: PageDefinition) {
    if (!draft) return
    setDraft({ ...draft, definition })
    setDirty(true)
  }
  const publishedRevision =
    draft?.kind === "saved"
      ? (results.find((page) => page._id === draft.pageId)?.publishedRevision ??
        draft.publishedRevision)
      : null
  /** Publish a newer revision or roll back to an older one. */
  async function selectRevision(revision: number) {
    if (draft?.kind !== "saved") return
    const action = revisionAction(revision, publishedRevision)
    if (action === "published") return
    if (
      action === "rollback" &&
      !window.confirm(`Roll back the published page to revision ${revision}?`)
    )
      return
    await run(async () => {
      const args = {
        pageId: draft.pageId,
        revision,
        expectedRevision: draft.revision,
        expectedPublishedRevision: publishedRevision,
      }
      await (action === "rollback" ? rollback(args) : publish(args))
      setDraft({ ...draft, publishedRevision: revision })
      toast.success(
        action === "rollback"
          ? `Rolled back to revision ${revision}`
          : `Published revision ${revision}`
      )
    })
  }
  const newPageButton = canWrite && (
    <Button
      disabled={pending}
      onClick={() => {
        if (!canLeave()) return
        setDraft({
          kind: "new",
          publishedRevision: null,
          definition: { title: "", blocks: [{ kind: "markdown", text: "" }] },
        })
        setDirty(true)
        setMessage("")
        setPreviewRevision(null)
      }}
    >
      New page
    </Button>
  )
  return (
    <section className="flex flex-col gap-6" aria-label="Pages">
      <PageHeader
        title="Pages"
        description="Text, tables, metrics, and charts built from your data."
        actions={newPageButton}
      />
      {status === "LoadingFirstPage" && <LoadingRows label="Loading pages" />}
      {status === "Exhausted" && results.length === 0 && !draft && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No pages yet</EmptyTitle>
            <EmptyDescription>
              A page shows text, tables, metrics, and charts from your data.
            </EmptyDescription>
          </EmptyHeader>
          {newPageButton && <EmptyContent>{newPageButton}</EmptyContent>}
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
          disabled={status === "LoadingMore" || pending}
          onClick={() => loadMore(20)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more pages"}
        </Button>
      )}
      {message && (
        <Alert variant="destructive">
          <AlertDescription className="break-words">{message}</AlertDescription>
        </Alert>
      )}
      {draft && (
        <div className="flex flex-col gap-4 border-t pt-4">
          {!canWrite && (
            <h3 className="text-lg font-semibold">{draft.definition.title}</h3>
          )}
          <label hidden={!canWrite} className="flex flex-col gap-2">
            Page title
            <Input
              maxLength={100}
              placeholder="Untitled page"
              autoFocus={draft.kind === "new"}
              value={draft.definition.title}
              disabled={pending}
              onChange={(event) =>
                change({ ...draft.definition, title: event.target.value })
              }
            />
          </label>
          <div className={canWrite ? "grid gap-6 md:grid-cols-2" : "grid"}>
            {canWrite && (
              <div className="flex flex-col gap-4">
                <h3 className="font-semibold">Edit markdown</h3>
                {draft.definition.blocks.map((block, index) =>
                  block.kind === "markdown" ? (
                    <label key={index} className="flex flex-col gap-2">
                      Markdown block {index + 1}
                      <textarea
                        className="min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm"
                        disabled={pending}
                        value={block.text}
                        onChange={(event) =>
                          change({
                            ...draft.definition,
                            blocks: draft.definition.blocks.map(
                              (item, position) =>
                                position === index
                                  ? {
                                      kind: "markdown",
                                      text: event.target.value,
                                    }
                                  : item
                            ),
                          })
                        }
                      />
                    </label>
                  ) : (
                    <p key={index} className="rounded-md border p-3">
                      {block.kind} block: {block.title}.{" "}
                      {block.kind === "table" ||
                      block.kind === "metric" ||
                      block.kind === "chart"
                        ? "Remove and add a block to change its binding."
                        : "This block is kept unchanged."}
                    </p>
                  )
                )}
                {draft.definition.blocks.map((block, index) => (
                  <Button
                    key={index}
                    variant="outline"
                    disabled={pending}
                    onClick={() => {
                      if (window.confirm(`Remove block ${index + 1}?`))
                        change({
                          ...draft.definition,
                          blocks: draft.definition.blocks.filter(
                            (_, position) => position !== index
                          ),
                        })
                    }}
                  >
                    Remove block {index + 1} ({block.kind})
                  </Button>
                ))}
                <label>
                  File or HTML report block title
                  <Input
                    maxLength={100}
                    value={artifactTitle}
                    disabled={pending}
                    onChange={(e) => setArtifactTitle(e.target.value)}
                  />
                </label>
                <ArtifactPicker
                  workspaceId={workspaceId}
                  disabled={pending || draft.definition.blocks.length >= 20}
                  choose={(artifactId, name) =>
                    change({
                      ...draft.definition,
                      blocks: [
                        ...draft.definition.blocks,
                        {
                          kind: "artifact",
                          title: artifactTitle.trim() || name.slice(0, 100),
                          artifactId,
                        },
                      ],
                    })
                  }
                />
                <ArtifactPicker
                  workspaceId={workspaceId}
                  label="Choose HTML report"
                  accepts={(contentType) => previewKind(contentType) === "html"}
                  disabled={pending || draft.definition.blocks.length >= 20}
                  choose={(artifactId, name) =>
                    change({
                      ...draft.definition,
                      blocks: [
                        ...draft.definition.blocks,
                        {
                          kind: "htmlReport",
                          title: artifactTitle.trim() || name.slice(0, 100),
                          artifactId,
                        },
                      ],
                    })
                  }
                />
                <PageSourcePicker
                  workspaceId={workspaceId}
                  disabled={pending || draft.definition.blocks.length >= 20}
                  add={(block) =>
                    change({
                      ...draft.definition,
                      blocks: [...draft.definition.blocks, block],
                    })
                  }
                />
                <Button
                  variant="outline"
                  disabled={pending || draft.definition.blocks.length >= 20}
                  onClick={() =>
                    change({
                      ...draft.definition,
                      blocks: [
                        ...draft.definition.blocks,
                        { kind: "markdown", text: "" },
                      ],
                    })
                  }
                >
                  Add markdown block
                </Button>
              </div>
            )}
            <div className="min-w-0">
              <h3 className="mb-4 font-semibold">Preview</h3>
              <div className="space-y-4 break-words [&_a]:underline [&_h1]:text-2xl [&_h2]:text-xl [&_pre]:overflow-auto [&_ul]:list-disc [&_ul]:pl-5">
                {draft.definition.blocks.map((block, index) => (
                  <div key={index}>
                    <PageBlockView
                      workspaceId={workspaceId}
                      stored={
                        draft.kind === "saved" && !dirty
                          ? { pageId: draft.pageId, revision: draft.revision }
                          : null
                      }
                      blockIndex={index}
                      block={block}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              hidden={!canWrite}
              disabled={pending || !dirty || !draft.definition.title.trim()}
              onClick={() =>
                void run(async () => {
                  const result = await save({
                    workspaceId,
                    pageId: draft.kind === "saved" ? draft.pageId : undefined,
                    expectedRevision:
                      draft.kind === "saved" ? draft.revision : undefined,
                    definition: draft.definition,
                  })
                  setDraft({
                    ...draft,
                    kind: "saved",
                    pageId: result.pageId,
                    revision: result.revision,
                  })
                  setDirty(false)
                  toast.success(`Saved revision ${result.revision}`)
                })
              }
            >
              Save changes
            </Button>
            <Button
              variant="outline"
              disabled={pending || dirty || draft.kind === "new"}
              onClick={() => {
                if (draft.kind === "saved") setPreviewRevision(draft.revision)
              }}
            >
              Preview saved revision
            </Button>
          </div>
          {draft.kind === "saved" && previewRevision !== null && (
            <PagePreview
              key={previewRevision}
              workspaceId={workspaceId}
              pageId={draft.pageId}
              revision={previewRevision}
              publishedRevision={publishedRevision}
              pending={pending || dirty}
              select={(revision) => void selectRevision(revision)}
              close={() => setPreviewRevision(null)}
            />
          )}
          {draft.kind === "saved" && (
            <div className="space-y-3">
              <h3 className="font-semibold">Publication history</h3>
              <p>
                Preview a revision to publish it or roll back to it. Save your
                edits first.
              </p>
              {history.status === "LoadingFirstPage" && (
                <p role="status">Loading history…</p>
              )}
              <ul>
                {history.results.map((version) => (
                  <li
                    key={version._id}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <span>
                      Revision {version.revision}
                      {publishedRevision === version.revision
                        ? " (published)"
                        : ""}
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
            </div>
          )}
        </div>
      )}
    </section>
  )
}
