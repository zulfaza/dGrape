import { useAction, useQuery } from "convex/react"
import { useRef, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { ArtifactPreview } from "./artifact-preview"
import { Button } from "./ui/button"

export function ArtifactLink({
  workspaceId,
  artifactId,
}: {
  workspaceId: Id<"workspaces">
  artifactId: Id<"artifacts">
}) {
  const metadata = useQuery(api.artifacts.metadata, { workspaceId, artifactId })
  const download = useAction(api.artifacts.getDownloadUrl)
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState("")
  const [downloadLink, setDownloadLink] = useState<{
    artifactId: Id<"artifacts">
    url: string
  } | null>(null)
  const [preparing, setPreparing] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  if (metadata === undefined) return <p role="status">Loading file…</p>
  if (metadata === null)
    return (
      <p role="status">
        File unavailable in this workspace. It may have been deleted.
      </p>
    )
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <p>
        {metadata.name} · {metadata.contentType} · {metadata.size} bytes
      </p>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        onClick={() => setPreview(true)}
      >
        Preview file
      </Button>{" "}
      <Button
        type="button"
        variant="outline"
        disabled={preparing}
        onClick={() => {
          setPreparing(true)
          setError("")
          setDownloadLink(null)
          void download({ artifactId })
            .then(
              (url) => {
                setDownloadLink({ artifactId, url })
              },
              () => setError("File download unavailable.")
            )
            .finally(() => setPreparing(false))
        }}
      >
        {preparing ? "Preparing download…" : "Prepare download"}
      </Button>
      {downloadLink?.artifactId === artifactId && (
        <a
          href={downloadLink.url}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Download file (link expires in 5 minutes)
        </a>
      )}
      {error && <p role="alert">{error}</p>}
      {preview && (
        <ArtifactPreview
          artifactId={artifactId}
          name={metadata.name}
          onClose={() => setPreview(false)}
          onReturnFocus={() => trigger.current?.focus()}
        />
      )}
    </div>
  )
}
