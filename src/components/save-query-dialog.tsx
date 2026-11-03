import { useMutation } from "convex/react"
import { Bookmark } from "lucide-react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { RecordQuery } from "../../convex/lib/recordQuery"
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
import { toast } from "@/components/ui/toast"

/**
 * Saves the current sort and filter as a named query. Each save makes a new
 * query that pins the collection's current schema, so page blocks can use it
 * as a live data source.
 */
export function SaveQueryDialog({
  collectionId,
  query,
  disabled,
}: {
  collectionId: Id<"collections">
  query: RecordQuery
  disabled: boolean
}) {
  const save = useMutation(api.savedQueries.save)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      await save({ collectionId, name, query })
      setName("")
      setOpen(false)
      toast.success("Query saved. Add it to a page as a live block.")
    } catch {
      toast.error("Could not save query")
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
        <Button variant="outline" disabled={disabled}>
          <Bookmark aria-hidden />
          Save as query
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as query</DialogTitle>
          <DialogDescription>
            Pages can show this sort and filter as a live table, metric or
            chart.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-4" disabled={saving}>
            <div className="grid gap-2">
              <Label htmlFor="save-query-name">Name</Label>
              <Input
                id="save-query-name"
                value={name}
                maxLength={100}
                required
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || name.trim() === ""}>
              {saving ? "Saving…" : "Save query"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
