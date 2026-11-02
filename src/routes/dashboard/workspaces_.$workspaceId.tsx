import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { useState, type FormEvent } from "react"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CollectionRecords } from "@/components/collection-records"
import type { Id } from "../../../convex/_generated/dataModel"
import { toast } from "@/components/ui/toast"

export const Route = createFileRoute("/dashboard/workspaces_/$workspaceId")({
  component: WorkspacePage,
  errorComponent: () => (
    <main className="p-6">
      Could not load this workspace. Check your access and try again.
    </main>
  ),
})

type Field = { id: string; label: string; type: "text" | "number" | "boolean" }

function WorkspacePage() {
  const { workspaceId } = Route.useParams()
  const workspace = useQuery(api.workspaces.get, { workspaceId })
  const { results, status, loadMore } = usePaginatedQuery(
    api.workspaces.listCollections,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const create = useMutation(api.workspaces.createCollection)
  const [selectedCollection, setSelectedCollection] = useState<Id<"collections"> | null>(null)
  const [name, setName] = useState("")
  const [fields, setFields] = useState<Field[]>([
    { id: "", label: "", type: "text" },
  ])
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (!name.trim()) {
      toast.error("Enter a collection name")
      return
    }
    if (fields.some((field) => !field.label.trim())) {
      toast.error("Enter a label for each field")
      return
    }
    if (new Set(fields.map((field) => field.id)).size !== fields.length) {
      toast.error("Field IDs must be unique")
      return
    }
    setSaving(true)
    try {
      await create({ workspaceId, name, fields })
      setName("")
      setFields([{ id: "", label: "", type: "text" }])
      toast.success("Collection created")
    } catch {
      toast.error("Could not create collection")
    } finally {
      setSaving(false)
    }
  }
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      {!selectedCollection && <Link to="/dashboard/workspaces">All workspaces</Link>}
      <h1 className="text-2xl font-semibold">
        {workspace ? workspace.name : "Loading workspace…"}
      </h1>
      {selectedCollection && <CollectionRecords key={selectedCollection} collectionId={selectedCollection} onClose={() => setSelectedCollection(null)} />}
      <div hidden={selectedCollection !== null}>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Collections</h2>
        {status === "LoadingFirstPage" ? (
          <p role="status">Loading collections…</p>
        ) : results.length === 0 ? (
          <p>No collections yet.</p>
        ) : (
          <ul className="grid gap-3">
            {results.map((collection) => (
              <li
                key={collection._id}
                className="rounded-lg border bg-card p-4"
              >
                <h3 className="font-medium">{collection.name}</h3>
                <Button variant="outline" onClick={() => setSelectedCollection(collection._id)}>Open collection</Button>
                <ul>
                  {collection.definition.fields.map((field) => (
                    <li key={field.id}>
                      {field.label} ({field.id}, {field.type})
                    </li>
                  ))}
                </ul>
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
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Create collection</h2>
        <form onSubmit={submit} className="flex max-w-xl flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="collection-name">Name</Label>
            <Input
              id="collection-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              disabled={saving}
            />
          </div>
          {fields.map((field, index) => (
            <fieldset
              key={index}
              className="grid gap-2 rounded-lg border p-4"
              disabled={saving}
            >
              <legend>Field {index + 1}</legend>
              <Label htmlFor={`label-${index}`}>Label</Label>
              <Input
                id={`label-${index}`}
                value={field.label}
                maxLength={100}
                required
                onChange={(e) =>
                  setFields(
                    fields.map((item, i) =>
                      i === index ? { ...item, label: e.target.value } : item
                    )
                  )
                }
              />
              <Label htmlFor={`id-${index}`}>Machine ID</Label>
              <Input
                id={`id-${index}`}
                value={field.id}
                maxLength={64}
                pattern="[a-z][a-z0-9_]*"
                required
                onChange={(e) =>
                  setFields(
                    fields.map((item, i) =>
                      i === index ? { ...item, id: e.target.value } : item
                    )
                  )
                }
              />
              <Label htmlFor={`type-${index}`}>Type</Label>
              <Select
                value={field.type}
                disabled={saving}
                onValueChange={(value) => {
                  if (
                    value === "text" ||
                    value === "number" ||
                    value === "boolean"
                  )
                    setFields(
                      fields.map((item, i) =>
                        i === index ? { ...item, type: value } : item
                      )
                    )
                }}
              >
                <SelectTrigger id={`type-${index}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="boolean">Boolean</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setFields(fields.filter((_, i) => i !== index))
                  }
                >
                  Remove field
                </Button>
              )}
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={saving || fields.length >= 50}
            onClick={() =>
              setFields([...fields, { id: "", label: "", type: "text" }])
            }
          >
            Add field
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create collection"}
          </Button>
        </form>
      </section>
      </div>
    </main>
  )
}
