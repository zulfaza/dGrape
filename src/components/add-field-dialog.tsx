import { useMutation } from "convex/react"
import { Plus } from "lucide-react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
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

type Field = Doc<"collections">["definition"]["fields"][number]
type FieldType = Field["type"]

const MAX_FIELDS = 50

function isFieldType(value: string): value is FieldType {
  return value === "text" || value === "number" || value === "boolean"
}

/**
 * Opens a form that adds an optional field to a collection. Records that
 * exist have no value for the new field until someone edits them.
 */
export function AddFieldDialog({
  collectionId,
  fields,
  disabled,
}: {
  collectionId: Id<"collections">
  fields: ReadonlyArray<Field>
  disabled: boolean
}) {
  const addField = useMutation(api.workspaces.addField)
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [id, setId] = useState("")
  const [type, setType] = useState<FieldType>("text")
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    if (fields.some((field) => field.id === id)) {
      toast.error("This field ID is already used")
      return
    }
    setSaving(true)
    try {
      await addField({ collectionId, field: { id, label, type } })
      setLabel("")
      setId("")
      setType("text")
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
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="boolean">Yes / no</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
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
