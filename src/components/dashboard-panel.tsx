import { useQuery } from "convex/react"
import { Match } from "effect"
import { Clock, TriangleAlert } from "lucide-react"
import type { ReactNode } from "react"
import ReactMarkdown from "react-markdown"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { PageBlock } from "../../convex/lib/pageDomain"
import type { SourceStatus } from "../../convex/lib/sourceSync"
import { ArtifactLink } from "./artifact-link"
import { HtmlSnapshotFrame, useArtifactPreview } from "./html-snapshot"
import { finite, PageChart } from "./page-chart"
import { Button } from "./ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip"
import { formatDateTime } from "@/lib/format-time"
import { valueText } from "@/lib/field-types"

/** A stored block that can read live values: its page revision and index. */
export type LiveAddress = {
  pageId: Id<"pages">
  revision: number
  blockIndex: number
}

type LiveBlock = Extract<PageBlock, { kind: "table" | "metric" | "chart" }>

/** Edit-mode controls that sit in a panel header. */
export type PanelControls = {
  /** The drag handle, before the title. */
  handle?: ReactNode
  /** The panel menu, at the end of the header. */
  menu?: ReactNode
}

/**
 * One dashboard panel: a card with a compact header and content that fills
 * the rest of its grid cell. Live blocks read `live`; pass null for a block
 * that is not saved yet.
 */
export function DashboardPanel({
  workspaceId,
  block,
  live,
  controls = {},
}: {
  workspaceId: Id<"workspaces">
  block: PageBlock
  live: LiveAddress | null
  controls?: PanelControls
}) {
  switch (block.kind) {
    case "markdown":
      return (
        <PanelFrame label="Text" controls={controls}>
          <div className="flex flex-col gap-2 break-words [&_a]:underline [&_h1]:text-2xl [&_h2]:text-xl [&_pre]:overflow-auto [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown skipHtml disallowedElements={["img"]}>
              {block.text}
            </ReactMarkdown>
          </div>
        </PanelFrame>
      )
    case "artifact":
      return (
        <PanelFrame label={block.title} title={block.title} controls={controls}>
          <ArtifactLink
            workspaceId={workspaceId}
            artifactId={block.artifactId}
          />
        </PanelFrame>
      )
    case "htmlReport":
      return (
        <PanelFrame label={block.title} title={block.title} controls={controls}>
          <HtmlReportContent
            artifactId={block.artifactId}
            title={block.title}
          />
        </PanelFrame>
      )
    case "table":
    case "metric":
    case "chart":
      return live ? (
        <LivePanel block={block} live={live} controls={controls} />
      ) : (
        <PanelFrame label={block.title} title={block.title} controls={controls}>
          <PanelNote>Save to load live data.</PanelNote>
        </PanelFrame>
      )
  }
}

/**
 * The panel card. `label` names the region for assistive technology; the
 * header shows only when there is a title or a control.
 */
function PanelFrame({
  label,
  title,
  status,
  controls,
  children,
}: {
  label: string
  title?: string
  status?: ReactNode
  controls: PanelControls
  children: ReactNode
}) {
  const header = title !== undefined || controls.handle || controls.menu
  return (
    <section
      aria-label={label}
      className="flex size-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground"
    >
      {header && (
        <header className="flex h-9 shrink-0 items-center gap-1 pr-1 pl-3">
          {controls.handle}
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
            {title}
          </h2>
          {status}
          {controls.menu}
        </header>
      )}
      <div
        className={
          header
            ? "min-h-0 flex-1 overflow-auto px-3 pb-3"
            : "min-h-0 flex-1 overflow-auto p-3"
        }
      >
        {children}
      </div>
    </section>
  )
}

function PanelNote({
  children,
  alert = false,
}: {
  children: ReactNode
  alert?: boolean
}) {
  return (
    <p
      role={alert ? "alert" : "status"}
      className="flex h-full items-center justify-center text-center text-sm text-muted-foreground"
    >
      {children}
    </p>
  )
}

function LivePanel({
  block,
  live,
  controls,
}: {
  block: LiveBlock
  live: LiveAddress
  controls: PanelControls
}) {
  const result = useQuery(api.pages.liveBlock, live)
  const frame = (status: ReactNode, children: ReactNode) => (
    <PanelFrame
      label={block.title}
      title={block.title}
      status={status}
      controls={controls}
    >
      {children}
    </PanelFrame>
  )
  if (result === undefined) return frame(null, <PanelNote>Loading…</PanelNote>)
  if (result.problem !== null)
    return frame(null, <PanelNote alert>{result.problem}</PanelNote>)
  const data = result.result
  // An aggregate result has one row per group; its key is unique.
  const rows =
    data.kind === "records"
      ? data.page
      : data.rows.map((row) => ({ _id: row.key, values: row.values }))
  const partial = data.completeness === "partial"
  const status = (
    <LiveStatus
      partial={partial}
      evaluatedAt={data.evaluatedAt}
      source={data.source}
    />
  )
  const fields = data.resultSchema.fields
  const label = (id: string) => fields.find((f) => f.id === id)?.label ?? id
  switch (block.kind) {
    case "chart":
      return frame(
        status,
        <PageChart block={block} rows={rows} fields={fields} />
      )
    case "table":
      return frame(
        status,
        rows.length === 0 ? (
          <PanelNote>No matching records.</PanelNote>
        ) : (
          <table className="w-full text-left text-sm tabular-nums">
            <caption className="sr-only">
              {block.title} · {rows.length} rows{partial ? " (partial)" : ""}
            </caption>
            <thead>
              <tr>
                {block.fields.map((field) => (
                  <th
                    scope="col"
                    key={field}
                    className="sticky top-0 bg-card px-2 py-1 font-medium text-muted-foreground"
                  >
                    {label(field)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row._id}>
                  {block.fields.map((field) => (
                    <td key={field} className="border-t px-2 py-1">
                      {row.values[field] === undefined
                        ? "Missing"
                        : valueText(row.values[field])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )
      )
    case "metric": {
      const numbers = rows.flatMap((row) => {
        const value = finite(row.values[block.field])
        return value === null ? [] : [value]
      })
      const sum = numbers.reduce((total, value) => total + value, 0)
      const excluded = rows.length - numbers.length
      const value =
        block.operation === "count"
          ? rows.length.toLocaleString()
          : numbers.length === 0
            ? "No data"
            : Number.isFinite(sum)
              ? sum.toLocaleString()
              : "Out of range"
      const caption = [
        partial ? "Sample" : null,
        block.operation === "count"
          ? "Record count"
          : `Sum of ${label(block.field)}`,
        block.operation === "sum" && excluded > 0
          ? `${excluded} invalid excluded`
          : null,
      ]
        .filter((part) => part !== null)
        .join(" · ")
      return frame(
        status,
        <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
          <p className="max-w-full truncate text-4xl font-semibold tabular-nums">
            {value}
            {block.unit && (
              <span className="ml-1 text-lg font-normal text-muted-foreground">
                {block.unit}
              </span>
            )}
          </p>
          <p className="max-w-full truncate text-xs text-muted-foreground">
            {caption}
          </p>
        </div>
      )
    }
  }
}

/** What a reader must know about one source: a warning, if any, and why. */
function sourceText(source: SourceStatus, now: number) {
  return Match.value(source.freshness).pipe(
    Match.discriminatorsExhaustive("kind")({
      never_synced: () => ({
        warning: null,
        text: `${source.name}: not synced by a recipe.`,
      }),
      synced: ({ staleAfter, lastSuccessfulSyncAt }) =>
        staleAfter !== null && now > staleAfter
          ? {
              warning: "Stale",
              text: `${source.name}: data from ${formatDateTime(lastSuccessfulSyncAt)}. A scheduled sync is late.`,
            }
          : {
              warning: null,
              text: `${source.name}: synced ${formatDateTime(lastSuccessfulSyncAt)}.`,
            },
      stale: ({ lastSuccessfulSyncAt, lastFailedAt }) => ({
        warning: "Stale",
        text: `${source.name}: data from ${formatDateTime(lastSuccessfulSyncAt)}. The sync failed at ${formatDateTime(lastFailedAt)}.`,
      }),
      failed: ({ lastFailedAt }) => ({
        warning: "Sync failed",
        text: `${source.name}: never synced. Last failure at ${formatDateTime(lastFailedAt)}.`,
      }),
    })
  )
}

/**
 * A small freshness mark in the panel header. A partial or stale result
 * shows a short word; the tooltip (on hover and focus) gives the details.
 */
function LiveStatus({
  partial,
  evaluatedAt,
  source,
}: {
  partial: boolean
  evaluatedAt: number
  source: SourceStatus
}) {
  const sync = sourceText(source, Date.now())
  const warning = sync.warning ?? (partial ? "Partial" : null)
  const lines = [
    partial
      ? "Partial result: the first bounded sample, not a complete total."
      : "Complete result.",
    `Read at ${formatDateTime(evaluatedAt)}.`,
    sync.text,
  ]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={warning ? "xs" : "icon-xs"}
          aria-label={lines.join(" ")}
        >
          {warning ? (
            <span className="flex items-center gap-1 text-warning">
              <TriangleAlert aria-hidden />
              {warning}
            </span>
          ) : (
            <Clock aria-hidden className="text-muted-foreground" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

/** An HTML report artifact as a static snapshot that fills the panel. */
function HtmlReportContent({
  artifactId,
  title,
}: {
  artifactId: Id<"artifacts">
  title: string
}) {
  const preview = useArtifactPreview(artifactId)
  if (preview.status === "loading")
    return <PanelNote>Loading report…</PanelNote>
  if (preview.status === "unavailable")
    return <PanelNote>{preview.message}</PanelNote>
  if (preview.kind !== "html")
    return <PanelNote>This file is not an HTML report.</PanelNote>
  return (
    <div className="flex h-full flex-col gap-1">
      <p className="text-xs text-muted-foreground">
        Report data captured{" "}
        <time dateTime={new Date(preview.capturedAt).toISOString()}>
          {formatDateTime(preview.capturedAt)}
        </time>
      </p>
      <HtmlSnapshotFrame
        html={preview.text}
        title={`${title} static snapshot`}
        className="min-h-0 w-full flex-1 rounded-md border"
      />
    </div>
  )
}
