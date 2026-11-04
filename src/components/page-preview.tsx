import { useQuery } from "convex/react"
import ReactMarkdown from "react-markdown"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { PageBlock } from "../../convex/lib/pageDomain"
import { ArtifactLink } from "./artifact-link"
import { HtmlReportBlock } from "./html-snapshot"
import { Button } from "./ui/button"
import { PageLiveBlock } from "./page-live-block"
import { useWorkspaceCan } from "@/components/workspace-role"

/**
 * Render one block as page viewers see it. Live blocks read the stored
 * revision, so pass `stored: null` for unsaved edits.
 */
export function PageBlockView({
  workspaceId,
  stored,
  blockIndex,
  block,
}: {
  workspaceId: Id<"workspaces">
  stored: { pageId: Id<"pages">; revision: number } | null
  blockIndex: number
  block: PageBlock
}) {
  if (block.kind === "markdown")
    return (
      <ReactMarkdown skipHtml disallowedElements={["img"]}>
        {block.text}
      </ReactMarkdown>
    )
  if (block.kind === "htmlReport")
    return <HtmlReportBlock artifactId={block.artifactId} title={block.title} />
  if (block.kind === "artifact")
    return (
      <section>
        <h4>{block.title}</h4>
        <ArtifactLink workspaceId={workspaceId} artifactId={block.artifactId} />
      </section>
    )
  return stored ? (
    <PageLiveBlock
      pageId={stored.pageId}
      revision={stored.revision}
      blockIndex={blockIndex}
      block={block}
    />
  ) : (
    <p>
      Save changes to preview live {block.kind}: {block.title}.
    </p>
  )
}

/** What selecting a stored revision does, relative to the published one. */
export function revisionAction(
  revision: number,
  publishedRevision: number | null
) {
  if (publishedRevision === revision) return "published" as const
  return publishedRevision !== null && revision < publishedRevision
    ? ("rollback" as const)
    : ("publish" as const)
}

/**
 * Read-only preview of a stored revision before it goes live. Shows binding
 * problems and blocks publish or rollback until they are fixed.
 */
export function PagePreview({
  workspaceId,
  pageId,
  revision,
  publishedRevision,
  pending,
  select,
  close,
}: {
  workspaceId: Id<"workspaces">
  pageId: Id<"pages">
  revision: number
  publishedRevision: number | null
  pending: boolean
  select: (revision: number) => void
  close: () => void
}) {
  const result = useQuery(api.pages.get, { pageId, revision })
  const canWrite = useWorkspaceCan("write")
  const action = revisionAction(revision, publishedRevision)
  const problems =
    result?.bindings.flatMap((problem, index) =>
      problem ? [{ index, problem }] : []
    ) ?? []
  return (
    <section
      aria-label={`Preview of revision ${revision}`}
      className="flex flex-col gap-4 rounded-md border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">
          Preview · revision {revision}
          {action === "published" ? " (published)" : " (not published)"}
        </h3>
        <div className="flex flex-wrap gap-2">
          {canWrite && action !== "published" && (
            <Button
              disabled={pending || result === undefined || problems.length > 0}
              onClick={() => select(revision)}
            >
              {action === "rollback"
                ? `Roll back to revision ${revision}`
                : `Publish revision ${revision}`}
            </Button>
          )}
          <Button variant="outline" onClick={close}>
            Close preview
          </Button>
        </div>
      </div>
      {result === undefined ? (
        <p role="status">Loading preview…</p>
      ) : (
        <>
          {problems.length > 0 && (
            <div role="alert">
              <p>Fix these blocks before this revision can go live:</p>
              <ul className="list-disc pl-5">
                {problems.map(({ index, problem }) => (
                  <li key={index}>
                    Block {index + 1}: {problem}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <h4 className="text-2xl">{result.version?.definition.title}</h4>
          <div className="space-y-4 break-words [&_a]:underline [&_h1]:text-2xl [&_h2]:text-xl [&_pre]:overflow-auto [&_ul]:list-disc [&_ul]:pl-5">
            {result.version?.definition.blocks.map((block, index) => (
              <div key={index}>
                <PageBlockView
                  workspaceId={workspaceId}
                  stored={{ pageId, revision }}
                  blockIndex={index}
                  block={block}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )
}
