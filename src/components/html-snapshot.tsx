import { useAction } from "convex/react"
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
