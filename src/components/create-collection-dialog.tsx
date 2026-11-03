import { collectionTemplates } from "../../convex/lib/collectionTemplates"
import { isFieldType } from "../../convex/lib/collectionDomain"
import { useMutation } from "convex/react"
import { Plus, Trash2 } from "lucide-react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
import { toast } from "@/components/ui/toast"

type FieldType =
  import("../../convex/lib/collectionDomain").CollectionField["type"]
type Field = {
  id: string
  label: string
  type: FieldType
  indexed: boolean
  optional?: true
}

const MAX_FIELDS = 50
const MAX_INDEXED_FIELDS = 5
const emptyField = (): Field => ({
  id: "",
  label: "",
  type: "text",
  indexed: false,
})

/** Opens a form that creates a collection with typed fields. */
export function CreateCollectionDialog({
  workspaceId,
}: {
  workspaceId: string
}) {
  const create = useMutation(api.workspaces.createCollection)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [fields, setFields] = useState<Field[]>([emptyField()])
  const [saving, setSaving] = useState(false)

  const updateField = (index: number, change: Partial<Field>) =>
    setFields(
      fields.map((field, i) => (i === index ? { ...field, ...change } : field))
    )

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
    const indexedCount = fields.filter((field) => field.indexed).length
    if (indexedCount > MAX_INDEXED_FIELDS) {
      toast.error(`Index at most ${MAX_INDEXED_FIELDS} fields`)
      return
    }
    setSaving(true)
    try {
      await create({
        workspaceId,
        name,
        fields: fields.map(({ indexed, ...field }) =>
          indexed ? { ...field, indexed } : field
        ),
      })
      setName("")
      setFields([emptyField()])
      setOpen(false)
      toast.success("Collection created")
    } catch {
      toast.error("Could not create collection")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) setOpen(nextOpen)
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Create collection
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create collection</DialogTitle>
          <DialogDescription>
            Name the collection and add the fields each record has.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">
            Start with a template, then edit its fields. Transaction amounts use
            minor units. Keep currencies separate.
          </p>
          <div className="flex gap-2">
            {collectionTemplates().map((template) => (
              <Button
                key={template.id}
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setName(template.name)
                  setFields(
                    template.fields.map((field) => ({
                      ...field,
                      indexed: field.indexed === true,
                    }))
                  )
                }}
              >
                {template.name}
              </Button>
            ))}
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-6">
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
          <fieldset className="flex flex-col gap-3" disabled={saving}>
            <legend className="mb-1 text-sm font-medium">Fields</legend>
            <p className="text-sm text-muted-foreground">
              The ID is what agents and the API use. Use lowercase letters,
              numbers, and underscores. Mark up to {MAX_INDEXED_FIELDS} fields
              as indexed to sort and filter by them. Indexed text is at most 200
              characters.
            </p>
            {fields.map((field, index) => (
              <div
                key={index}
                className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_8rem_auto_auto]"
              >
                <div className="grid gap-2">
                  <Label htmlFor={`label-${index}`}>Label</Label>
                  <Input
                    id={`label-${index}`}
                    value={field.label}
                    maxLength={100}
                    required
                    onChange={(e) =>
                      updateField(index, { label: e.target.value })
                    }
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`id-${index}`}>ID</Label>
                  <Input
                    id={`id-${index}`}
                    value={field.id}
                    maxLength={64}
                    pattern="[a-z][a-z0-9_]*"
                    required
                    className="font-mono"
                    onChange={(e) => updateField(index, { id: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`type-${index}`}>Type</Label>
                  <Select
                    value={field.type}
                    disabled={saving}
                    onValueChange={(value) => {
                      if (isFieldType(value))
                        updateField(index, { type: value })
                    }}
                  >
                    <SelectTrigger id={`type-${index}`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="number">Number</SelectItem>
                        <SelectItem value="integer">
                          Integer / minor units
                        </SelectItem>
                        <SelectItem value="currency">Currency code</SelectItem>
                        <SelectItem value="boolean">Yes / no</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id={`indexed-${index}`}
                    checked={field.indexed}
                    onCheckedChange={(checked) =>
                      updateField(index, { indexed: checked === true })
                    }
                  />
                  <Label htmlFor={`indexed-${index}`}>Indexed</Label>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove field ${index + 1}`}
                  disabled={fields.length === 1}
                  onClick={() =>
                    setFields(fields.filter((_, i) => i !== index))
                  }
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={fields.length >= MAX_FIELDS}
              onClick={() => setFields([...fields, emptyField()])}
            >
              <Plus aria-hidden />
              Add field
            </Button>
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Creating…" : "Create collection"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
