import { usePaginatedQuery } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "./ui/button"
import { LoadingRows } from "@/components/loading-rows"

export function ArtifactPicker({
  workspaceId,
  disabled,
  choose,
  label = "Choose workspace file",
  accepts = () => true,
}: {
  workspaceId: Id<"workspaces">
  disabled: boolean
  choose: (id: Id<"artifacts">, name: string) => void
  /** Button text when the picker is closed. */
  label?: string
  /** Shows only files whose content type passes; the server validates again. */
  accepts?: (contentType: string) => boolean
}) {
  const [open, setOpen] = useState(false)
  const files = usePaginatedQuery(
    api.artifacts.list,
    open ? { workspaceId } : "skip",
    { initialNumItems: 20 }
  )
  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {open ? "Close file picker" : label}
      </Button>
      {open && (
        <div
          className="flex max-h-64 flex-col gap-2 overflow-auto"
          aria-label="Workspace file picker"
        >
          {files.status === "LoadingFirstPage" && (
            <LoadingRows label="Loading files" rows={2} />
          )}
          {files.status === "Exhausted" && files.results.length === 0 && (
            <p>Upload a file in Files first.</p>
          )}
          {files.results
            .filter((file) => accepts(file.contentType))
            .map((file) => (
              <Button
                key={file._id}
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => {
                  choose(file._id, file.name)
                  setOpen(false)
                }}
              >
                {file.name}
              </Button>
            ))}
          {files.status === "CanLoadMore" && (
            <Button type="button" onClick={() => files.loadMore(20)}>
              Load more files
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
