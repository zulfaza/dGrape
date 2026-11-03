import { useAction } from "convex/react"
import { Match } from "effect"
import { useEffect, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { staticSnapshot } from "../lib/static-snapshot"

export type ArtifactPreviewState =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | {
      status: "ready"
      text: string
      capturedAt: number
      kind: "text" | "json" | "html" | "raster"
    }

/** Loads a bounded, membership-checked preview. Change `reload` to fetch again. */
export function useArtifactPreview(
  artifactId: Id<"artifacts">,
  reload = 0
): ArtifactPreviewState {
  const getPreview = useAction(api.artifacts.getPreview)
  const [preview, setPreview] = useState<ArtifactPreviewState>({
    status: "loading",
  })
  useEffect(() => {
    let active = true
    setPreview({ status: "loading" })
    void getPreview({ artifactId }).then(
      (result) => {
        if (active) setPreview(result)
      },
      () => {
        if (active)
          setPreview({
            status: "unavailable",
            message:
              "You cannot preview this file. Check workspace access and try again.",
          })
      }
    )
    return () => {
      active = false
    }
  }, [artifactId, getPreview, reload])
  return preview
}

/**
 * Sanitized static HTML in a frame with an empty sandbox: an opaque origin with
 * no scripts, cookies, storage, forms, popups or navigation. The document CSP
 * denies all network requests. Never add sandbox tokens here.
 */
export function HtmlSnapshotFrame({
  html,
  title,
  className,
}: {
  html: string
  title: string
  className: string
}) {
  return (
    <iframe
      title={title}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={staticSnapshot(html)}
      className={className}
    />
  )
}

/** Page block for an HTML report artifact; shows its report data time. */
export function HtmlReportBlock({
  artifactId,
  title,
}: {
  artifactId: Id<"artifacts">
  title: string
}) {
  const preview = useArtifactPreview(artifactId)
  return (
    <section className="flex flex-col gap-2">
      <h4 className="font-semibold">{title}</h4>
      {Match.value(preview).pipe(
        Match.when({ status: "loading" }, () => (
          <p role="status">Loading report…</p>
        )),
        Match.when({ status: "unavailable" }, ({ message }) => (
          <p role="status">{message}</p>
        )),
        Match.orElse(({ kind, text, capturedAt }) =>
          kind === "html" ? (
            <>
              <p className="text-xs text-muted-foreground">
                Report data captured{" "}
                <time dateTime={new Date(capturedAt).toISOString()}>
                  {new Date(capturedAt).toLocaleString()}
                </time>
              </p>
              <HtmlSnapshotFrame
                html={text}
                title={`${title} static snapshot`}
                className="h-[60vh] w-full rounded-md border"
              />
            </>
          ) : (
            <p role="status">This file is not an HTML report.</p>
          )
        )
      )}
    </section>
  )
}
