import { ArtifactPreview } from "./artifact-preview"
import { useAction, useMutation, usePaginatedQuery } from "convex/react"
import { Download, Eye, Trash2, Upload } from "lucide-react"
import { useRef, useState, type ChangeEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"

const MAX_BYTES = 25 * 1024 * 1024

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/**
 * The workspace's files (artifacts). The browser sends the file straight to
 * R2 with a signed URL, then asks Convex to record it.
 */
export function WorkspaceArtifacts({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.artifacts.list,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const createUpload = useMutation(api.artifacts.createUpload)
  const completeUpload = useAction(api.artifacts.completeUpload)
  const getDownloadUrl = useAction(api.artifacts.getDownloadUrl)
  const remove = useMutation(api.artifacts.remove)
  const input = useRef<HTMLInputElement>(null)
  const previewTrigger = useRef<HTMLButtonElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState<{
    id: Id<"artifacts">
    name: string
    contentType: string
  } | null>(null)

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""
    if (!file || busy) return
    if (file.size > MAX_BYTES) {
      toast.error("A file can be at most 25 MB")
      return
    }
    setBusy(true)
    try {
      const { key, url } = await createUpload({ workspaceId, name: file.name })
      const put = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      })
      if (!put.ok) throw new Error("Upload failed")
      const result = await completeUpload({ workspaceId, key })
      if (result.status === "invalid") toast.error(result.message)
      else toast.success("File uploaded")
    } catch {
      toast.error("Could not upload the file")
    } finally {
      setBusy(false)
    }
  }

  async function download(artifactId: Id<"artifacts">) {
    try {
      const url = await getDownloadUrl({ artifactId })
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      toast.error("Could not download the file")
    }
  }

  async function deleteArtifact(artifactId: Id<"artifacts">, name: string) {
    if (!window.confirm(`Delete ${name}? You cannot undo this.`)) return
    setBusy(true)
    try {
      if ((await remove({ artifactId })) === "referenced")
        toast.error("A record references this file. Change that record first.")
      else toast.success("File deleted")
    } catch {
      toast.error("Could not delete the file")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="files-heading" className="flex flex-col gap-3">
      {preview && (
        <ArtifactPreview
          key={preview.id}
          artifactId={preview.id}
          name={preview.name}
          contentType={preview.contentType}
          onClose={() => setPreview(null)}
          onReturnFocus={() => previewTrigger.current?.focus()}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="files-heading" className="text-base font-semibold">
            Files
          </h2>
          <p className="text-sm text-muted-foreground">
            Reports and files that you or your agents keep in this workspace.
          </p>
        </div>
        <input
          ref={input}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={upload}
        />
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload aria-hidden />
          {busy ? "Working…" : "Upload file"}
        </Button>
      </div>
      {status === "LoadingFirstPage" ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading files…
        </p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">No files yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {results.map((artifact) => (
            <li
              key={artifact._id}
              className="flex items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium">
                  {artifact.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatSize(artifact.size)} ·{" "}
                  {new Date(artifact._creationTime).toLocaleDateString()} ·{" "}
                  {artifact.createdBy.kind === "agent"
                    ? "By an agent"
                    : "By you"}
                </span>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Preview ${artifact.name}`}
                  onClick={(event) => {
                    previewTrigger.current = event.currentTarget
                    setPreview({
                      id: artifact._id,
                      name: artifact.name,
                      contentType: artifact.contentType,
                    })
                  }}
                >
                  <Eye aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Download ${artifact.name}`}
                  onClick={() => download(artifact._id)}
                >
                  <Download aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${artifact.name}`}
                  disabled={busy}
                  onClick={() => deleteArtifact(artifact._id, artifact.name)}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => loadMore(20)}
        >
          Load more
        </Button>
      )}
    </section>
  )
}
