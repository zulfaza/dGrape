import { useConvex, useMutation, usePaginatedQuery } from "convex/react"
import { useState } from "react"
import ReactMarkdown from "react-markdown"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { PageDefinition } from "../../convex/lib/pageDomain"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

type Draft = {
  pageId?: Id<"pages">
  revision?: number
  publishedRevision: number | null
  definition: PageDefinition
}

export function WorkspacePages({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const client = useConvex()
  const save = useMutation(api.pages.save)
  const publish = useMutation(api.pages.publish)
  const { results, status, loadMore } = usePaginatedQuery(
    api.pages.list,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const [draft, setDraft] = useState<Draft | null>(null)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")
  const [dirty, setDirty] = useState(false)
  const history = usePaginatedQuery(
    api.pages.history,
    draft?.pageId ? { pageId: draft.pageId } : "skip",
    { initialNumItems: 20 }
  )

  async function run(action: () => Promise<void>) {
    setPending(true)
    setMessage("")
    try {
      await action()
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not complete this action. Try again."
      )
    } finally {
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
        pageId,
        revision,
        publishedRevision: result.page.publishedRevision ?? null,
        definition: result.version.definition,
      })
      setDirty(false)
    })
  }
  function change(definition: PageDefinition) {
    if (!draft) return
    setDraft({ ...draft, definition })
    setDirty(true)
  }
  async function publishRevision(revision: number) {
    if (!draft?.pageId || draft.revision === undefined) return
    const pageId = draft.pageId
    await run(async () => {
      await publish({
        pageId,
        revision,
        expectedRevision: draft.revision ?? 0,
        expectedPublishedRevision: draft.publishedRevision,
      })
      setDraft({ ...draft, publishedRevision: revision })
      setMessage(`Published revision ${revision}.`)
    })
  }
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border bg-card p-5 lg:col-span-2"
      aria-label="Workspace pages"
    >
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">Pages</h2>
        <Button
          disabled={pending}
          onClick={() => {
            if (!canLeave()) return
            setDraft({
              publishedRevision: null,
              definition: {
                title: "Untitled page",
                blocks: [{ kind: "markdown", text: "" }],
              },
            })
            setDirty(true)
            setMessage("")
          }}
        >
          New page
        </Button>
      </div>
      {status === "LoadingFirstPage" && <p role="status">Loading pages…</p>}
      {status === "Exhausted" && results.length === 0 && (
        <p>No pages yet. Create a page to start.</p>
      )}
      <ul className="divide-y">
        {results.map((page) => (
          <li
            key={page._id}
            className="flex flex-wrap items-center justify-between gap-3 py-3"
          >
            <span>
              {page.title} · Revision {page.revision} ·{" "}
              {page.publishedRevision
                ? `Published ${page.publishedRevision}`
                : "Unpublished"}
            </span>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => void open(page._id, page.revision)}
            >
              Open<span className="sr-only"> {page.title}</span>
            </Button>
          </li>
        ))}
      </ul>
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          disabled={status === "LoadingMore" || pending}
          onClick={() => loadMore(20)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more pages"}
        </Button>
      )}
      {pending && <p role="status">Working…</p>}
      {message && (
        <p role="alert" className="break-words">
          {message}{" "}
          {message.includes("revision conflict") &&
            "Your changes are kept. Open the page again to load the latest revision."}
        </p>
      )}
      {draft && (
        <div className="flex flex-col gap-4 border-t pt-4">
          <label className="flex flex-col gap-2">
            Page title
            <Input
              maxLength={100}
              value={draft.definition.title}
              disabled={pending}
              onChange={(event) =>
                change({ ...draft.definition, title: event.target.value })
              }
            />
          </label>
          <div className="grid gap-6 md:grid-cols-2">
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
                                ? { kind: "markdown", text: event.target.value }
                                : item
                          ),
                        })
                      }
                    />
                  </label>
                ) : (
                  <p key={index} className="rounded-md border p-3">
                    Unsupported {block.kind} block: {block.title}. This block is
                    kept unchanged.
                  </p>
                )
              )}
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
            <div className="min-w-0">
              <h3 className="mb-4 font-semibold">Preview</h3>
              <div className="space-y-4 break-words [&_a]:underline [&_h1]:text-2xl [&_h2]:text-xl [&_pre]:overflow-auto [&_ul]:list-disc [&_ul]:pl-5">
                {draft.definition.blocks.map((block, index) => (
                  <div key={index}>
                    {block.kind === "markdown" ? (
                      <ReactMarkdown skipHtml>{block.text}</ReactMarkdown>
                    ) : (
                      <p>
                        Preview unavailable for {block.kind}: {block.title}.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={pending || !dirty || !draft.definition.title.trim()}
              onClick={() =>
                void run(async () => {
                  const result = await save({
                    workspaceId,
                    pageId: draft.pageId,
                    expectedRevision: draft.revision,
                    definition: draft.definition,
                  })
                  setDraft({
                    ...draft,
                    pageId: result.pageId,
                    revision: result.revision,
                  })
                  setDirty(false)
                  setMessage(`Saved revision ${result.revision}.`)
                })
              }
            >
              Save changes
            </Button>
            <Button
              variant="outline"
              disabled={pending || dirty || draft.revision === undefined}
              onClick={() => {
                if (draft.revision !== undefined)
                  void publishRevision(draft.revision)
              }}
            >
              Publish saved revision
            </Button>
          </div>
          {draft.pageId && (
            <div className="space-y-3">
              <h3 className="font-semibold">Publication history</h3>
              <p>
                Rollback changes the published revision. Unsaved edits stay in
                the editor.
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
                      {draft.publishedRevision === version.revision
                        ? " (published)"
                        : ""}
                    </span>
                    <Button
                      variant="outline"
                      disabled={
                        pending ||
                        dirty ||
                        draft.publishedRevision === version.revision
                      }
                      onClick={() => void publishRevision(version.revision)}
                    >
                      Publish revision {version.revision}
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
