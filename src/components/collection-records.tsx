import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"

type Values = Doc<"collectionRecords">["values"]
type Field = Doc<"collections">["definition"]["fields"][number]
type Draft = {
  record: Doc<"collectionRecords"> | null
  values: Record<string, string | boolean>
}

function initialValues(fields: Field[]): Draft["values"] {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      field.type === "boolean" ? false : field.type === "number" ? "0" : "",
    ])
  )
}

function editValues(values: Values): Draft["values"] {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      typeof value === "number" ? String(value) : value,
    ])
  )
}

export function CollectionRecords({
  collectionId,
  onClose,
}: {
  collectionId: Id<"collections">
  onClose: () => void
}) {
  const collection = useQuery(api.workspaces.getCollection, { collectionId })
  const { results, status, loadMore } = usePaginatedQuery(
    api.workspaces.listRecords,
    { collectionId },
    { initialNumItems: 20 }
  )
  const create = useMutation(api.workspaces.createRecord)
  const update = useMutation(api.workspaces.updateRecord)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const latest = useQuery(
    api.workspaces.getRecord,
    conflict && draft?.record
      ? { collectionId, recordId: draft.record._id }
      : "skip"
  )
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft || saving) return
    const values: Values = {}
    for (const field of collection?.definition.fields ?? []) {
      const value = draft.values[field.id]
      if (field.type === "number") {
        if (
          typeof value !== "string" ||
          value.trim() === "" ||
          !Number.isFinite(Number(value))
        ) {
          toast.error("Enter a valid number")
          return
        }
        values[field.id] = Number(value)
      } else if (value !== undefined) values[field.id] = value
    }
    setSaving(true)
    try {
      if (draft.record) {
        const result = await update({
          collectionId,
          recordId: draft.record._id,
          expectedRevision: draft.record.revision,
          values,
        })
        if (result === "conflict") {
          setConflict(true)
          return
        }
      } else await create({ collectionId, values })
      setDraft(null)
      toast.success("Record saved")
    } catch {
      toast.error("Could not save record")
    } finally {
      setSaving(false)
    }
  }
  if (!collection) return <p role="status">Loading collection…</p>
  return (
    <section className="flex flex-col gap-4">
      <Button variant="outline" onClick={onClose} disabled={saving}>
        Back to collections
      </Button>
      <h2 className="text-xl font-semibold">{collection.name}</h2>
      <Button
        disabled={saving}
        onClick={() => {
          setConflict(false)
          setDraft({
            record: null,
            values: initialValues(collection.definition.fields),
          })
        }}
      >
        New record
      </Button>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading records…</p>
      ) : results.length === 0 ? (
        <p>No records yet.</p>
      ) : (
        <ul className="grid gap-3">
          {results.map((record) => (
            <li key={record._id} className="rounded-lg border p-4">
              <dl>
                {collection.definition.fields.map((field) => (
                  <div key={field.id}>
                    <dt>{field.label}</dt>
                    <dd>{String(record.values[field.id] ?? "")}</dd>
                  </div>
                ))}
              </dl>
              <Button
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setConflict(false)
                  setDraft({ record, values: editValues(record.values) })
                }}
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Load more
        </Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more…</p>}
      {draft && (
        <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          <h3>{draft.record ? "Edit record" : "New record"}</h3>
          {collection.definition.fields.map((field) => (
            <div className="grid gap-2" key={field.id}>
              <Label htmlFor={`record-${field.id}`}>{field.label}</Label>
              {field.type === "boolean" ? (
                <Checkbox
                  disabled={saving}
                  id={`record-${field.id}`}
                  checked={draft.values[field.id] === true}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      values: { ...draft.values, [field.id]: checked === true },
                    })
                  }
                />
              ) : (
                <Input
                  disabled={saving}
                  id={`record-${field.id}`}
                  type={field.type === "number" ? "number" : "text"}
                  step={field.type === "number" ? "any" : undefined}
                  maxLength={field.type === "text" ? 10000 : undefined}
                  required={field.type === "number"}
                  value={String(draft.values[field.id] ?? "")}
                  onChange={(e) => {
                    const value = e.target.value
                    setDraft({
                      ...draft,
                      values: { ...draft.values, [field.id]: value },
                    })
                  }}
                />
              )}
            </div>
          ))}
          {conflict && (
            <p role="alert">This record changed. Reload it before you save.</p>
          )}
          {conflict && draft.record && (
            <Button
              type="button"
              variant="outline"
              disabled={saving || !latest}
              onClick={() => {
                if (latest) {
                  setDraft({
                    record: latest,
                    values: editValues(latest.values),
                  })
                  setConflict(false)
                }
              }}
            >
              {latest === undefined ? "Loading record…" : "Reload record"}
            </Button>
          )}
          <Button type="submit" disabled={saving || conflict}>
            {saving ? "Saving…" : "Save record"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => setDraft(null)}
          >
            Cancel
          </Button>
        </form>
      )}
    </section>
  )
}
