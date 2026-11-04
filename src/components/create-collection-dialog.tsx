import { collectionTemplates } from "../../convex/lib/collectionTemplates"
import {
  isChoiceField,
  isFieldType,
  isIndexableType,
  MAX_FIELDS,
  type CollectionField,
} from "../../convex/lib/collectionDomain"
import type { Id } from "../../convex/_generated/dataModel"
import { useMutation, useQuery } from "convex/react"
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
import { FieldOptionsInput } from "@/components/field-options-input"
import { CollectionTargetInput } from "@/components/reference-field-input"
import {
  buildField,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  parseOptionLines,
} from "@/lib/field-types"

type FieldType = CollectionField["type"]
type Field = {
  id: string
  label: string
  type: FieldType
  /** Select options, one on each line. Other types ignore it. */
  options: string
  /** The collection a record reference field points to. */
  target: Id<"collections"> | null
  indexed: boolean
  optional?: true
}

const emptyField = (): Field => ({
  id: "",
  label: "",
  type: "text",
  options: "",
  target: null,
  indexed: false,
})

/** Opens a form that creates a collection with typed fields. */
export function CreateCollectionDialog({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const create = useMutation(api.workspaces.createCollection)
  const maxIndexed = useQuery(api.workspaceBudgets.get, { workspaceId })
    ?.budgets.indexedFieldsPerCollection
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
    const indexedCount = fields.filter(
      (field) => field.indexed && isIndexableType(field.type)
    ).length
    // Until the budget loads, the server alone decides.
    if (maxIndexed !== undefined && indexedCount > maxIndexed) {
      toast.error(`This workspace allows at most ${maxIndexed} indexed fields`)
      return
    }
    const built: CollectionField[] = []
    for (const field of fields) {
      const next = buildField(
        field.id,
        field.label,
        field.type,
        parseOptionLines(field.options),
        field.target,
        field.indexed
      )
      if (!next) {
        toast.error(`Choose the collection that "${field.label}" references`)
        return
      }
      built.push(field.optional ? { ...next, optional: field.optional } : next)
    }
    setSaving(true)
    try {
      await create({ workspaceId, name, fields: built })
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
                      id: field.id,
                      label: field.label,
                      type: field.type,
                      options: isChoiceField(field)
                        ? field.options.join("\n")
                        : "",
                      target:
                        field.type === "recordReference"
                          ? field.collectionId
                          : null,
                      indexed: field.indexed === true,
                      optional: field.optional,
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
              numbers, and underscores. Mark fields as indexed to sort and
              filter by them
              {maxIndexed !== undefined && ` (at most ${maxIndexed})`}. Indexed
              text is at most 200 characters.
            </p>
            {fields.map((field, index) => (
              <div
                key={index}
                className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_12rem_auto_auto]"
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
                        {FIELD_TYPES.map((fieldType) => (
                          <SelectItem key={fieldType} value={fieldType}>
                            {FIELD_TYPE_LABELS[fieldType]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex h-9 items-center gap-2">
                  <Checkbox
                    id={`indexed-${index}`}
                    checked={field.indexed && isIndexableType(field.type)}
                    disabled={!isIndexableType(field.type)}
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
                {field.type === "recordReference" && (
                  <div className="grid gap-2 sm:col-span-5">
                    <Label htmlFor={`target-${index}`}>Collection</Label>
                    <CollectionTargetInput
                      id={`target-${index}`}
                      workspaceId={workspaceId}
                      value={field.target}
                      disabled={saving}
                      onChange={(target) => updateField(index, { target })}
                    />
                  </div>
                )}
                {(field.type === "select" || field.type === "multiSelect") && (
                  <div className="sm:col-span-5">
                    <FieldOptionsInput
                      id={`options-${index}`}
                      value={field.options}
                      disabled={saving}
                      onChange={(options) => updateField(index, { options })}
                    />
                  </div>
                )}
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
