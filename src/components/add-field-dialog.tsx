import {
  isFieldType,
  isIndexableType,
  MAX_FIELDS,
} from "../../convex/lib/collectionDomain"
import { useMutation, useQuery } from "convex/react"
import { Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
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

type Field = Doc<"collections">["definition"]["fields"][number]
type FieldType = Field["type"]

/**
 * Opens a form that adds an optional field to a collection. Records that
 * exist have no value for the new field until someone edits them.
 */
export function AddFieldDialog({
  workspaceId,
  collectionId,
  fields,
  disabled,
}: {
  workspaceId: Id<"workspaces">
  collectionId: Id<"collections">
  fields: ReadonlyArray<Field>
  disabled: boolean
}) {
  const addField = useMutation(api.workspaces.addField)
  const maxIndexed = useQuery(api.workspaceBudgets.get, { workspaceId })
    ?.budgets.indexedFieldsPerCollection
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [id, setId] = useState("")
  const [type, setType] = useState<FieldType>("text")
  const [options, setOptions] = useState("")
  const [target, setTarget] = useState<Id<"collections"> | null>(null)
  const [indexed, setIndexed] = useState(false)
  const hasOptions = type === "select" || type === "multiSelect"
  // Until the budget loads, the server alone decides.
  const canIndex =
    maxIndexed === undefined ||
    fields.filter((field) => field.indexed).length < maxIndexed
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (fields.some((field) => field.id === id)) {
      toast.error("This field ID is already used")
      return
    }
    const field = buildField(
      id,
      label,
      type,
      parseOptionLines(options),
      target,
      indexed
    )
    if (!field) {
      toast.error("Choose the collection to reference")
      return
    }
    setSaving(true)
    try {
      await addField({ collectionId, field })
      setLabel("")
      setId("")
      setType("text")
      setOptions("")
      setTarget(null)
      setIndexed(false)
      setOpen(false)
      toast.success("Field added")
    } catch {
      toast.error("Could not add field")
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
        <Button
          variant="outline"
          disabled={disabled || fields.length >= MAX_FIELDS}
        >
          <Plus aria-hidden />
          Add field
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add field</DialogTitle>
          <DialogDescription>
            The new field is optional. Records that exist stay as they are.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-4" disabled={saving}>
            <div className="grid gap-2">
              <Label htmlFor="new-field-label">Label</Label>
              <Input
                id="new-field-label"
                value={label}
                maxLength={100}
                required
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-field-id">ID</Label>
              <Input
                id="new-field-id"
                value={id}
                maxLength={64}
                pattern="[a-z][a-z0-9_]*"
                required
                className="font-mono"
                onChange={(e) => setId(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-field-type">Type</Label>
              <Select
                value={type}
                disabled={saving}
                onValueChange={(value) => {
                  if (isFieldType(value)) setType(value)
                }}
              >
                <SelectTrigger id="new-field-type" className="w-full">
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
            {type === "recordReference" && (
              <div className="grid gap-2">
                <Label htmlFor="new-field-target">Collection</Label>
                <CollectionTargetInput
                  id="new-field-target"
                  workspaceId={workspaceId}
                  value={target}
                  disabled={saving}
                  onChange={setTarget}
                />
              </div>
            )}
            {hasOptions && (
              <FieldOptionsInput
                id="new-field-options"
                value={options}
                disabled={saving}
                onChange={setOptions}
              />
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="new-field-indexed"
                checked={indexed && isIndexableType(type)}
                disabled={!canIndex || !isIndexableType(type)}
                onCheckedChange={(checked) => setIndexed(checked === true)}
              />
              <Label htmlFor="new-field-indexed">
                Index to sort and filter by this field
              </Label>
            </div>
            {!canIndex && (
              <p className="text-sm text-muted-foreground">
                This workspace allows at most {maxIndexed} indexed fields in a
                collection.
              </p>
            )}
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Adding…" : "Add field"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
