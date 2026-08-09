import { useMemo, useState } from "react"
import { useAction, useMutation } from "convex/react"
import { Layers3, Loader2, Sparkles } from "lucide-react"

import { api } from "../../convex/_generated/api"
import { Button } from "#/components/ui/button.tsx"
import { Checkbox } from "#/components/ui/checkbox.tsx"
import { Label } from "#/components/ui/label.tsx"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "#/components/ui/sheet.tsx"
import { Textarea } from "#/components/ui/textarea.tsx"

type PreviewRole = {
  companyName: string
  companyWebsite: string
  sourceUrl: string
  position: string
  jobDescription: string
  parseConfidence: number
}

export function ApplicationBatchImportSheet() {
  const previewBatch = useAction(api.applications.previewBatch)
  const createBatch = useMutation(api.applications.createBatch)
  const [open, setOpen] = useState(false)
  const [rawText, setRawText] = useState("")
  const [roles, setRoles] = useState<PreviewRole[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [result, setResult] = useState<string>()
  const selectedRoles = useMemo(
    () => roles.filter((_, index) => selected.has(index)),
    [roles, selected]
  )

  const reset = () => {
    setRawText("")
    setRoles([])
    setSelected(new Set())
    setError(undefined)
    setResult(undefined)
  }

  const handlePreview = async () => {
    setBusy(true)
    setError(undefined)
    setResult(undefined)
    try {
      const nextRoles = await previewBatch({ rawText })
      setRoles(nextRoles)
      setSelected(new Set(nextRoles.map((_, index) => index)))
      if (nextRoles.length === 0) setError("No distinct roles were found in that text.")
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  const handleImport = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const imported = await createBatch({ rawText, roles: selectedRoles })
      setResult(
        `${imported.createdCount} new role${imported.createdCount === 1 ? "" : "s"} added · ${imported.duplicateCount} duplicate source${imported.duplicateCount === 1 ? "" : "s"} attached.`
      )
      setRoles([])
      setSelected(new Set())
    } catch (cause) {
      setError(toErrorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet
      onOpenChange={(nextOpen) => {
        if (busy) return
        setOpen(nextOpen)
        if (!nextOpen) reset()
      }}
      open={open}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          <Layers3 /> Import list
        </Button>
      </SheetTrigger>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Import a role list</SheetTitle>
          <SheetDescription>
            Paste ranked research, a saved job list, or several complete postings. Review parse
            confidence before anything is saved.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-5 px-4">
          <div className="grid gap-2">
            <Label htmlFor="batch-role-text">Role list</Label>
            <Textarea
              className="min-h-56"
              disabled={busy || roles.length > 0}
              id="batch-role-text"
              onChange={(event) => setRawText(event.target.value)}
              placeholder="Paste several roles with company, title, URL, requirements, and notes…"
              value={rawText}
            />
            {roles.length === 0 ? (
              <Button
                className="w-fit"
                disabled={busy || !rawText.trim()}
                onClick={() => void handlePreview()}
                type="button"
                variant="outline"
              >
                {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
                Parse roles
              </Button>
            ) : null}
          </div>

          {roles.length > 0 ? (
            <section className="border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <p className="text-sm font-medium">{roles.length} roles found</p>
                <p className="text-xs text-muted-foreground">{selected.size} selected</p>
              </div>
              <div className="divide-y divide-border">
                {roles.map((role, index) => (
                  <label className="flex cursor-pointer items-start gap-3 p-3" key={`${role.companyName}-${role.position}-${index}`}>
                    <Checkbox
                      checked={selected.has(index)}
                      onCheckedChange={(checked) =>
                        setSelected((current) => {
                          const next = new Set(current)
                          if (checked === true) next.add(index)
                          else next.delete(index)
                          return next
                        })
                      }
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{role.position || "Unknown role"}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {role.companyName || "Unknown company"}
                        {role.sourceUrl ? ` · ${role.sourceUrl}` : ""}
                      </span>
                    </span>
                    <span
                      className={`border px-2 py-0.5 text-xs ${role.parseConfidence >= 0.8 ? "border-emerald-800 text-emerald-300" : role.parseConfidence >= 0.55 ? "border-amber-800 text-amber-300" : "border-red-800 text-red-300"}`}
                    >
                      {Math.round(role.parseConfidence * 100)}%
                    </span>
                  </label>
                ))}
              </div>
            </section>
          ) : null}
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          {result ? <p className="text-sm text-emerald-400">{result}</p> : null}
        </div>
        <SheetFooter>
          {roles.length > 0 ? (
            <>
              <Button disabled={busy || selected.size === 0} onClick={() => void handleImport()} type="button">
                {busy ? <Loader2 className="animate-spin" /> : null}
                Import {selected.size} role{selected.size === 1 ? "" : "s"}
              </Button>
              <Button disabled={busy} onClick={() => { setRoles([]); setSelected(new Set()) }} type="button" variant="outline">
                Back
              </Button>
            </>
          ) : (
            <Button disabled={busy} onClick={() => setOpen(false)} type="button" variant="outline">
              Close
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function toErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Request failed"
}
