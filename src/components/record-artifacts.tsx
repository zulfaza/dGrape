import { useMutation, useQuery } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { ArtifactPicker } from "./artifact-picker"
import { ArtifactLink } from "./artifact-link"
import { Button } from "./ui/button"

export function RecordArtifacts({
  workspaceId,
  recordId,
}: {
  workspaceId: Id<"workspaces">
  recordId: Id<"collectionRecords">
}) {
  const rows = useQuery(api.artifactBindings.list, { recordId })
  const bind = useMutation(api.artifactBindings.bind)
  const unbind = useMutation(api.artifactBindings.unbind)
  const [relation, setRelation] = useState<"attachment" | "report" | "image">(
    "attachment"
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  async function run(action: () => Promise<Id<"artifactBindings"> | null>) {
    setPending(true)
    setError("")
    try {
      await action()
    } catch {
      setError(
        "Could not update file links. Check the file type, access, and 20 link limit."
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="flex flex-col gap-3" aria-label="Record files">
      <h3>Linked files{rows === undefined ? "" : ` (${rows.length}/20)`}</h3>
      {rows === undefined && <p role="status">Loading file links…</p>}
      <label>
        File relation{" "}
        <select
          value={relation}
          disabled={pending}
          onChange={(e) => {
            const value = e.target.value
            if (
              value === "attachment" ||
              value === "report" ||
              value === "image"
            )
              setRelation(value)
          }}
        >
          <option value="attachment">Attachment</option>
          <option value="report">Report (PDF, JSON, text, CSV)</option>
          <option value="image">Image (PNG, JPEG, WebP, GIF)</option>
        </select>
      </label>
      <ArtifactPicker
        workspaceId={workspaceId}
        disabled={pending || rows === undefined || rows.length >= 20}
        choose={(artifactId) => {
          void run(() => bind({ recordId, artifactId, relation }))
        }}
      />
      {rows?.map((row) => (
        <div key={`${row.artifactId}-${row.relation}`}>
          <p>{row.relation}</p>
          <ArtifactLink workspaceId={workspaceId} artifactId={row.artifactId} />
          <Button
            type="button"
            disabled={pending}
            variant="outline"
            onClick={() => {
              void run(() =>
                unbind({
                  recordId,
                  artifactId: row.artifactId,
                  relation: row.relation,
                })
              )
            }}
          >
            Remove file link
          </Button>
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
