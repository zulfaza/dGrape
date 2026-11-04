import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Match } from "effect"
import { HtmlSnapshotFrame, useArtifactPreview } from "./html-snapshot"
import { previewKind } from "../../convex/lib/artifactPreview"
import { useMutation } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog"
import { useWorkspaceCan } from "@/components/workspace-role"

export function ArtifactPreview({
  artifactId,
  name,
  contentType,
  onClose,
  onReturnFocus,
}: {
  artifactId: Id<"artifacts">
  name: string
  contentType: string
  onClose: () => void
  onReturnFocus: () => void
}) {
  const canWrite = useWorkspaceCan("write")
  const saveTimestamp = useMutation(api.artifacts.setDataTimestamp)
  const [timestamp, setTimestamp] = useState("")
  const [timestampStatus, setTimestampStatus] = useState("")
  const [reload, setReload] = useState(0)
  const preview = useArtifactPreview(artifactId, reload)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="sm:max-w-3xl"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          onReturnFocus()
        }}
      >
        <DialogTitle>{name}</DialogTitle>
        <DialogDescription>
          Private file preview. HTML reports are static snapshots; scripts and
          links are disabled.
        </DialogDescription>
        {canWrite && previewKind(contentType) === "html" && (
          <details>
            <summary>HTML report data timestamp</summary>
            <label className="block">
              Data captured at
              <Input
                type="datetime-local"
                value={timestamp}
                onChange={(event) => setTimestamp(event.target.value)}
              />
            </label>
            <Button
              type="button"
              onClick={() => {
                const dataTimestamp = new Date(timestamp).getTime()
                if (!Number.isFinite(dataTimestamp)) {
                  setTimestampStatus("Choose a valid date and time.")
                  return
                }
                void saveTimestamp({ artifactId, dataTimestamp }).then(
                  () => {
                    setTimestampStatus("Data timestamp saved.")
                    setReload((value) => value + 1)
                  },
                  () =>
                    setTimestampStatus(
                      "Could not save. Use a past date for an HTML file and check workspace access."
                    )
                )
              }}
            >
              Save data timestamp
            </Button>
            <Button
              type="button"
              onClick={() => {
                void saveTimestamp({ artifactId, dataTimestamp: null }).then(
                  () => {
                    setTimestampStatus(
                      "Timestamp cleared; HTML preview disabled."
                    )
                    setReload((value) => value + 1)
                  },
                  () => setTimestampStatus("Could not clear timestamp.")
                )
              }}
            >
              Clear timestamp
            </Button>
            <p role="status">{timestampStatus}</p>
          </details>
        )}
        {Match.value(preview).pipe(
          Match.when({ status: "loading" }, () => (
            <p role="status">Loading preview…</p>
          )),
          Match.when({ status: "unavailable" }, (preview) => (
            <p role="status">{preview.message}</p>
          )),
          Match.orElse((preview) => (
            <>
              <p className="text-xs text-muted-foreground">
                {Match.value(preview.kind).pipe(
                  Match.when("html", () => "Report data captured"),
                  Match.orElse(() => "File uploaded")
                )}{" "}
                <time dateTime={new Date(preview.capturedAt).toISOString()}>
                  {new Date(preview.capturedAt).toLocaleString()}
                </time>
              </p>
              {Match.value(preview.kind).pipe(
                Match.when("html", () => (
                  <HtmlSnapshotFrame
                    html={preview.text}
                    title={`${name} static snapshot`}
                    className="h-[60vh] w-full border"
                  />
                )),
                Match.when("raster", () => (
                  <img
                    src={preview.text}
                    alt={`Preview of ${name}`}
                    className="max-h-[65vh] max-w-full object-contain"
                  />
                )),
                Match.orElse(() => (
                  <pre
                    tabIndex={0}
                    aria-label={`${name} content`}
                    className="max-h-[65vh] overflow-auto rounded-lg border p-4 text-sm break-words whitespace-pre-wrap"
                  >
                    {preview.text}
                  </pre>
                ))
              )}
            </>
          ))
        )}
      </DialogContent>
    </Dialog>
  )
}
