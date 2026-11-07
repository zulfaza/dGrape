import { useMutation, useQuery } from "convex/react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import {
  isChoiceField,
  isFieldType,
  type Checked,
  type CollectionField,
  type RecordValue,
} from "../../convex/lib/collectionDomain"
import type { FieldChange } from "../../convex/lib/schemaMigrations"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  fromInputText,
  parseOptionLines,
} from "@/lib/field-types"
import { LoadingRows } from "@/components/loading-rows"

type FieldType = CollectionField["type"]
type Migration = Doc<"schemaMigrations">

/** One field of the plan form: the target shape of an existing field. */
type Row = {
  field: CollectionField
  type: FieldType
  options: string
  target: Id<"collections"> | null
  required: boolean
  indexed: boolean
  removed: boolean
  /** Text of the value for records with no value; empty for none. */
  defaultText: string
}

/** The checkboxes of a row, with their labels. */
const ROW_FLAGS: ReadonlyArray<
  readonly ["required" | "indexed" | "removed", string]
> = [
  ["required", "Required"],
  ["indexed", "Indexed"],
  ["removed", "Remove"],
]

function toRow(field: CollectionField): Row {
  return {
    field,
    type: field.type,
    options: isChoiceField(field) ? field.options.join("\n") : "",
    target: field.type === "recordReference" ? field.collectionId : null,
    required: field.optional !== true,
    indexed: field.indexed === true,
    removed: false,
    defaultText: "",
  }
}

/** The default value of a row, or null for none. */
function parseDefault(row: Row): Checked<RecordValue> | null {
  const text = row.defaultText.trim()
  if (text === "" || !canHaveDefault(row.type)) return null
  if (row.type === "boolean") {
    if (text === "true" || text === "false")
      return { ok: true, value: text === "true" }
    return { ok: false, message: "Enter true or false" }
  }
  if (row.type === "multiSelect") return { ok: true, value: [text] }
  return fromInputText(row.type, text)
}

const canHaveDefault = (type: FieldType) =>
  type !== "recordReference" && type !== "artifactReference"

/** "a" → "b" in words, for one changed field. */
function describeChange(change: FieldChange): string {
  if (change.kind === "added")
    return `Add "${change.field.label}" (${FIELD_TYPE_LABELS[change.field.type]})`
  if (change.kind === "removed") return `Remove "${change.field.label}"`
  const { before, after } = change
  const parts: string[] = []
  if (before.label !== after.label)
    parts.push(`label "${before.label}" → "${after.label}"`)
  if (before.type !== after.type)
    parts.push(
      `type ${FIELD_TYPE_LABELS[before.type]} → ${FIELD_TYPE_LABELS[after.type]}`
    )
  if (before.optional !== after.optional)
    parts.push(after.optional ? "now optional" : "now required")
  if (before.indexed !== after.indexed)
    parts.push(after.indexed ? "now indexed" : "no longer indexed")
  if (
    isChoiceField(before) &&
    isChoiceField(after) &&
    before.options.join("\n") !== after.options.join("\n")
  )
    parts.push("options changed")
  if (
    before.type === "recordReference" &&
    after.type === "recordReference" &&
    before.collectionId !== after.collectionId
  )
    parts.push("references another collection")
  return `"${before.label}": ${parts.join(", ")}`
}

/** True while a migration can still change records or the schema. */
function isOpen(migration: Migration) {
  return (
    migration.state.kind !== "active" && migration.state.kind !== "cancelled"
  )
}

/**
 * Opens a form that plans a schema change that "Add field" cannot make: a
 * type change, required or optional, options, indexes, or removal. The
 * plan then shows its dry run, and starts the migration on request.
 */
export function ChangeSchemaDialog({
  workspaceId,
  collectionId,
  definition,
  lockedBy,
  disabled,
}: {
  workspaceId: Id<"workspaces">
  collectionId: Id<"collections">
  definition: Doc<"collections">["definition"]
  /** The migration that holds the collection lock, if any. */
  lockedBy: Id<"schemaMigrations"> | null
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<Id<"schemaMigrations"> | null>(null)
  const latest = useQuery(
    api.schemaMigrations.list,
    open
      ? { collectionId, paginationOpts: { numItems: 1, cursor: null } }
      : "skip"
  )
  const latestOpen = latest?.page.find(
    (migration) => isOpen(migration) && !migration.outdated
  )
  const migrationId = shown ?? lockedBy ?? latestOpen?._id ?? null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" disabled={disabled}>
          Edit fields
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit fields</DialogTitle>
          <DialogDescription>
            Change field types, required fields, options, or indexes, or remove
            fields. A dry run first finds the records that do not fit.
          </DialogDescription>
        </DialogHeader>
        {latest === undefined ? (
          <LoadingRows label="Loading fields" />
        ) : migrationId ? (
          <MigrationReport
            migrationId={migrationId}
            onClose={() => setShown(null)}
          />
        ) : (
          <PlanForm
            // A schema change elsewhere starts the form again from the new fields.
            key={definition.version}
            workspaceId={workspaceId}
            collectionId={collectionId}
            definition={definition}
            onPlanned={setShown}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PlanForm({
  workspaceId,
  collectionId,
  definition,
  onPlanned,
}: {
  workspaceId: Id<"workspaces">
  collectionId: Id<"collections">
  definition: Doc<"collections">["definition"]
  onPlanned: (migrationId: Id<"schemaMigrations">) => void
}) {
  const plan = useMutation(api.schemaMigrations.plan)
  const [rows, setRows] = useState(() => definition.fields.map(toRow))
  const [saving, setSaving] = useState(false)

  function update(index: number, patch: Partial<Row>) {
    setRows(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    const fields: CollectionField[] = []
    const defaults: Record<string, RecordValue> = {}
    for (const row of rows) {
      if (row.removed) continue
      const field = buildField(
        row.field.id,
        row.field.label,
        row.type,
        parseOptionLines(row.options),
        row.target,
        row.indexed
      )
      if (!field) {
        toast.error(
          `Choose the collection that "${row.field.label}" references`
        )
        return
      }
      fields.push(row.required ? field : { ...field, optional: true })
      const value = parseDefault(row)
      if (value && !value.ok) {
        toast.error(`"${row.field.label}": ${value.message}`)
        return
      }
      if (value) defaults[row.field.id] = value.value
    }
    if (fields.length === 0) {
      toast.error("Keep at least one field")
      return
    }
    setSaving(true)
    try {
      onPlanned(
        await plan({
          collectionId,
          expectedVersion: definition.version,
          fields,
          defaults,
        })
      )
    } catch {
      toast.error(
        "Could not plan the change. Check the fields, or reload if the schema changed."
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-3" disabled={saving}>
        <legend className="mb-1 text-sm font-medium">
          Fields (schema version {definition.version})
        </legend>
        {rows.map((row, index) => (
          <div
            key={row.field.id}
            className="grid items-end gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_12rem]"
          >
            <div className="grid gap-1">
              <span className="text-sm font-medium">{row.field.label}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {row.field.id}
              </span>
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`migration-type-${index}`}>Type</Label>
              <Select
                value={row.type}
                disabled={saving || row.removed}
                onValueChange={(value) => {
                  if (isFieldType(value)) update(index, { type: value })
                }}
              >
                <SelectTrigger
                  id={`migration-type-${index}`}
                  className="w-full"
                >
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
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              {ROW_FLAGS.map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={`migration-${key}-${index}`}
                    checked={row[key]}
                    disabled={key !== "removed" && row.removed}
                    onCheckedChange={(checked) =>
                      update(index, { [key]: checked === true })
                    }
                  />
                  <Label htmlFor={`migration-${key}-${index}`}>{label}</Label>
                </div>
              ))}
            </div>
            {!row.removed && row.type === "recordReference" && (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`migration-target-${index}`}>Collection</Label>
                <CollectionTargetInput
                  id={`migration-target-${index}`}
                  workspaceId={workspaceId}
                  value={row.target}
                  disabled={saving}
                  onChange={(target) => update(index, { target })}
                />
              </div>
            )}
            {!row.removed &&
              (row.type === "select" || row.type === "multiSelect") && (
                <div className="sm:col-span-2">
                  <FieldOptionsInput
                    id={`migration-options-${index}`}
                    value={row.options}
                    disabled={saving}
                    onChange={(options) => update(index, { options })}
                  />
                </div>
              )}
            {!row.removed && canHaveDefault(row.type) && (
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor={`migration-default-${index}`}>
                  Value for records with no value (optional)
                </Label>
                <Input
                  id={`migration-default-${index}`}
                  value={row.defaultText}
                  placeholder={row.type === "boolean" ? "true or false" : ""}
                  onChange={(e) =>
                    update(index, { defaultText: e.target.value })
                  }
                />
              </div>
            )}
          </div>
        ))}
        <p className="text-sm text-muted-foreground">
          Values convert when they can: numbers to text, text to numbers when it
          parses, and text to a select option. Use Add field for a new field.
        </p>
      </fieldset>
      <DialogFooter>
        <Button type="submit" disabled={saving}>
          {saving ? "Planning…" : "Plan change"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function MigrationReport({
  migrationId,
  onClose,
}: {
  migrationId: Id<"schemaMigrations">
  onClose: () => void
}) {
  const migration = useQuery(api.schemaMigrations.get, { migrationId })
  const dryRun = useMutation(api.schemaMigrations.dryRun)
  const start = useMutation(api.schemaMigrations.start)
  const cancel = useMutation(api.schemaMigrations.cancel)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<null>, failure: string) {
    setBusy(true)
    try {
      await action()
    } catch {
      toast.error(failure)
    } finally {
      setBusy(false)
    }
  }

  if (migration === undefined) return <LoadingRows label="Loading the plan" />
  const { state } = migration
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">
          Schema version {migration.source.version} → {migration.target.version}
        </h3>
        <ul className="list-disc pl-5 text-sm">
          {migration.changes.map((change) => (
            <li
              key={
                change.kind === "changed" ? change.after.id : change.field.id
              }
            >
              {describeChange(change)}
            </li>
          ))}
        </ul>
      </div>
      {migration.rollbackLimitations.length > 0 && (
        <Alert>
          <AlertTitle>A later change cannot undo this</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {migration.rollbackLimitations.map((limitation) => (
                <li key={limitation}>{limitation}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      {migration.outdated && isOpen(migration) && (
        <Alert variant="destructive">
          <AlertTitle>The schema changed after this plan</AlertTitle>
          <AlertDescription>
            Cancel it and plan the change again.
          </AlertDescription>
        </Alert>
      )}
      <div role="status" className="flex flex-col gap-2 text-sm">
        {state.kind === "planned" && <p>Run a dry run to check the records.</p>}
        {(state.kind === "dryRunning" || state.kind === "validating") && (
          <p>
            {state.kind === "dryRunning" ? "Dry run" : "Checking again"}:{" "}
            {state.checked} records checked…
          </p>
        )}
        {state.kind === "checked" && (
          <>
            <p>
              {state.checked} records checked.{" "}
              {state.misfitCount === 0
                ? "Every record fits."
                : `${state.misfitCount} do not fit. Change them, then run the dry run again.`}
            </p>
            {state.misfits.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg border p-3">
                {state.misfits.map((misfit) => (
                  <li key={misfit.recordId}>
                    <span className="font-mono text-xs">{misfit.recordId}</span>
                    : {misfit.message}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {state.kind === "backfilling" && (
          <p>
            Writing records: {state.written} done. Record changes wait until it
            ends.
            {state.error && ` It stopped: ${state.error}`}
          </p>
        )}
        {state.kind === "active" && (
          <p>
            Done. Schema version {migration.target.version} is active;{" "}
            {state.written} records changed. Save saved queries again to use it.
          </p>
        )}
        {state.kind === "cancelled" && <p>This plan is cancelled.</p>}
      </div>
      <DialogFooter>
        {(state.kind === "planned" || state.kind === "checked") && (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await cancel({ migrationId })
                  onClose()
                  return null
                }, "Could not cancel the plan")
              }
            >
              Cancel plan
            </Button>
            {!migration.outdated && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    () => dryRun({ migrationId }),
                    "Could not start the dry run"
                  )
                }
              >
                {state.kind === "planned" ? "Dry run" : "Dry run again"}
              </Button>
            )}
          </>
        )}
        {state.kind === "checked" &&
          state.misfitCount === 0 &&
          !migration.outdated && (
            <Button
              disabled={busy}
              onClick={() =>
                run(() => start({ migrationId }), "Could not start the change")
              }
            >
              Change records
            </Button>
          )}
        {state.kind === "backfilling" && state.error && (
          <Button
            disabled={busy}
            onClick={() =>
              run(() => start({ migrationId }), "Could not resume the change")
            }
          >
            Resume
          </Button>
        )}
        {!isOpen(migration) && (
          <Button variant="outline" onClick={onClose}>
            Plan another change
          </Button>
        )}
      </DialogFooter>
    </div>
  )
}
