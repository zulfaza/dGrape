import { useAction } from "convex/react"
import { useEffect, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog"

type Preview =
  | { status: "loading" }
  | { status: "unavailable"; message: string }
  | { status: "ready"; text: string; capturedAt: number }

export function ArtifactPreview({
  artifactId,
  name,
  onClose,
  onReturnFocus,
}: {
  artifactId: Id<"artifacts">
  name: string
  onClose: () => void
  onReturnFocus: () => void
}) {
  const getPreview = useAction(api.artifacts.getPreview)
  const [preview, setPreview] = useState<Preview>({ status: "loading" })
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
  }, [artifactId, getPreview])
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
          Private file preview. Text is displayed without running file content.
        </DialogDescription>
        {preview.status === "loading" ? (
          <p role="status">Loading preview…</p>
        ) : preview.status === "unavailable" ? (
          <p role="status">{preview.message}</p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              File uploaded{" "}
              <time dateTime={new Date(preview.capturedAt).toISOString()}>
                {new Date(preview.capturedAt).toLocaleString()}
              </time>
            </p>
            <pre
              tabIndex={0}
              aria-label={`${name} content`}
              className="max-h-[65vh] overflow-auto rounded-lg border p-4 text-sm break-words whitespace-pre-wrap"
            >
              {preview.text}
            </pre>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
