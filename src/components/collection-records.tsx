import { RecordArtifacts } from "./record-artifacts"
import {
  isNumericField,
  isObjectValue,
  checkRecordValues,
  MAX_OBJECT_DEPTH,
} from "../../convex/lib/collectionDomain"
import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import type { RecordQuery } from "../../convex/lib/recordQuery"
import { ChevronLeft, Plus, Trash2 } from "lucide-react"
import { Match } from "effect"
import { AddFieldDialog } from "@/components/add-field-dialog"
import {
  MultiSelectFieldInput,
  SelectFieldInput,
} from "@/components/choice-field-input"
import {
  ArtifactReferenceInput,
  RecordReferenceInput,
  SecretRefInput,
} from "@/components/reference-field-input"
import { ExportRecordsButton } from "@/components/export-records-button"
import { Mascot } from "@/components/mascot"
import { useWorkspaceCan } from "@/components/workspace-role"
import { RecordQueryBar } from "@/components/record-query-bar"
import { SaveQueryDialog } from "@/components/save-query-dialog"
import { PageHeader } from "@/components/page-header"
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/toast"
import {
  fromInputText,
  inputStep,
  inputType,
  parseObjectText,
  timestampInputText,
  valueText,
} from "@/lib/field-types"

type Values = Doc<"collectionRecords">["values"]
type Field = Doc<"collections">["definition"]["fields"][number]
type Draft = {
  record: Doc<"collectionRecords"> | null
  values: Record<string, string | boolean | string[]>
}

function initialValues(fields: Field[]): Draft["values"] {
  return Object.fromEntries(
    fields.map((field) => [
      field.id,
      field.type === "boolean"
        ? false
        : field.type === "multiSelect"
          ? []
          : isNumericField(field.type) && !field.optional
            ? "0"
            : "",
    ])
  )
}

function editValues(fields: Field[], values: Values): Draft["values"] {
  return Object.fromEntries(
    fields.flatMap((field) => {
      const value = values[field.id]
      if (value === undefined) return []
      return [
        [
          field.id,
          field.type === "timestamp" && typeof value === "number"
            ? timestampInputText(value)
            : isObjectValue(value)
              ? JSON.stringify(value, null, 2)
              : typeof value === "boolean" || Array.isArray(value)
                ? value
                : String(value),
        ],
      ]
    })
  )
}

export function CollectionRecords({
  collectionId,
  onClose,
}: {
  collectionId: Id<"collections">
  onClose: () => void
}) {
  const siteUrl = import.meta.env.VITE_CONVEX_SITE_URL
  const apiUrl = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/agent/records?collectionId=${encodeURIComponent(collectionId)}`
    : null
  const collection = useQuery(api.workspaces.getCollection, { collectionId })
  const [query, setQuery] = useState<RecordQuery | null>(null)
  const listed = usePaginatedQuery(
    api.workspaces.listRecords,
    query ? "skip" : { collectionId },
    { initialNumItems: 20 }
  )
  const queried = usePaginatedQuery(
    api.workspaces.queryRecords,
    query ? { collectionId, query } : "skip",
    { initialNumItems: 20 }
  )
  const { results, status, loadMore } = query ? queried : listed
  const canWrite = useWorkspaceCan("write")
  const create = useMutation(api.workspaces.createRecord)
  const update = useMutation(api.workspaces.updateRecord)
  const remove = useMutation(api.workspaces.deleteRecord)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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
      // An empty optional field has no value, so the record leaves it out.
      if (
        field.optional &&
        (value === undefined ||
          value === "" ||
          (Array.isArray(value) && value.length === 0))
      )
        continue
      const stored = draft.record?.values[field.id]
      // Local time can be ambiguous (a daylight saving change), so an
      // unchanged timestamp keeps its stored value.
      if (
        field.type === "timestamp" &&
        typeof stored === "number" &&
        value === timestampInputText(stored)
      ) {
        values[field.id] = stored
        continue
      }
      if (field.type === "object" && typeof value === "string") {
        const parsed = parseObjectText(value)
        if (!parsed.ok) {
          toast.error(`${field.label}: ${parsed.message}`)
          return
        }
        values[field.id] = parsed.value
      } else if (typeof value === "string") {
        const parsed = fromInputText(field.type, value)
        if (!parsed.ok) {
          toast.error(parsed.message)
          return
        }
        values[field.id] = parsed.value
      } else if (value !== undefined) values[field.id] = value
    }
    const checked = checkRecordValues(
      collection?.definition.fields ?? [],
      values
    )
    if (!checked.ok) {
      toast.error(checked.message)
      return
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
  async function deleteDraftRecord() {
    if (!draft?.record || saving) return
    setSaving(true)
    try {
      const result = await remove({
        collectionId,
        recordId: draft.record._id,
        expectedRevision: draft.record.revision,
      })
      if (result === "conflict") {
        setConfirmingDelete(false)
        setConflict(true)
        return
      }
      if (result === "referenced") {
        setConfirmingDelete(false)
        toast.error(
          "Another record references this record. Change or delete that record first."
        )
        return
      }
      setDraft(null)
      toast.success("Record deleted")
    } catch {
      toast.error("Could not delete record")
    } finally {
      setSaving(false)
    }
  }
  if (!collection)
    return (
      <p role="status" className="text-muted-foreground">
        Loading collection…
      </p>
    )
  const { fields } = collection.definition
  const setDraftValue = (fieldId: string, value: Draft["values"][string]) =>
    setDraft(
      (current) =>
        current && {
          ...current,
          values: { ...current.values, [fieldId]: value },
        }
    )
  const openDraft = (next: Draft) => {
    setConflict(false)
    setConfirmingDelete(false)
    setDraft(next)
  }
  const newRecordButton = canWrite && (
    <Button
      disabled={saving}
      onClick={() => openDraft({ record: null, values: initialValues(fields) })}
    >
      <Plus aria-hidden />
      New record
    </Button>
  )
  return (
    <>
      <div className="flex flex-col gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 self-start text-muted-foreground"
          onClick={onClose}
          disabled={saving}
        >
          <ChevronLeft aria-hidden />
          All collections
        </Button>
        <PageHeader
          title={collection.name}
          description={
            fields.length === 1 ? "1 field" : `${fields.length} fields`
          }
          actions={
            <>
              <ExportRecordsButton collection={collection} disabled={saving} />
              {canWrite && query && (
                <SaveQueryDialog
                  collectionId={collectionId}
                  query={query}
                  disabled={saving}
                />
              )}
              {canWrite && (
                <AddFieldDialog
                  workspaceId={collection.workspaceId}
                  collectionId={collectionId}
                  fields={fields}
                  disabled={saving}
                />
              )}
              {(results.length > 0 || query) && newRecordButton}
            </>
          }
        />
      </div>
      <RecordQueryBar fields={fields} query={query} onChange={setQuery} />
      <section
        aria-label="Records"
        className="overflow-hidden rounded-lg border bg-card"
      >
        {status === "LoadingFirstPage" ? (
          <p role="status" className="px-5 py-6 text-muted-foreground">
            Loading records…
          </p>
        ) : results.length === 0 && query ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No records match</EmptyTitle>
              <EmptyDescription>
                Records with no value for the sort field are not shown. Change
                the filter, or sort by order added to see every record.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : results.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <Mascot pose="chart" size={160} />
              </EmptyMedia>
              <EmptyTitle>Add your first record</EmptyTitle>
              <EmptyDescription>
                Fill in a record here, or let your agent add records with a
                credential that has the data.write scope.
              </EmptyDescription>
            </EmptyHeader>
            {newRecordButton && <EmptyContent>{newRecordButton}</EmptyContent>}
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {fields.map((field) => (
                  <TableHead
                    key={field.id}
                    className={
                      isNumericField(field.type) ? "px-4 text-right" : "px-4"
                    }
                  >
                    {field.label}
                  </TableHead>
                ))}
                {canWrite && (
                  <TableHead className="px-4">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((record) => (
                <TableRow key={record._id}>
                  {fields.map((field) => (
                    <TableCell
                      key={field.id}
                      className={
                        isNumericField(field.type)
                          ? "px-4 py-3 text-right tabular-nums"
                          : "max-w-80 truncate px-4 py-3"
                      }
                    >
                      {(field.type === "recordReference" ||
                        field.type === "artifactReference") &&
                      typeof record.values[field.id] === "string" ? (
                        <ReferenceLabel
                          collectionId={collectionId}
                          id={String(record.values[field.id])}
                        />
                      ) : (
                        formatValue(field, record.values[field.id])
                      )}
                    </TableCell>
                  ))}
                  {canWrite && (
                    <TableCell className="w-0 px-4 py-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={saving}
                        onClick={() =>
                          openDraft({
                            record,
                            values: editValues(fields, record.values),
                          })
                        }
                      >
                        Edit
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {status === "CanLoadMore" && (
          <div className="border-t px-5 py-3">
            <Button variant="outline" onClick={() => loadMore(20)}>
              Load more
            </Button>
          </div>
        )}
        {status === "LoadingMore" && (
          <p role="status" className="border-t px-5 py-3">
            Loading more…
          </p>
        )}
      </section>
      <section
        aria-labelledby="api-heading"
        className="flex flex-col gap-2 border-t pt-6"
      >
        <h2 id="api-heading" className="text-base font-semibold">
          Read with the HTTP API
        </h2>
        {apiUrl ? (
          <>
            <p className="text-sm text-muted-foreground">
              Send a workspace credential in the Authorization header as Bearer,
              a space, then the credential.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 rounded-sm bg-muted px-2 py-1.5 text-xs break-all">
                {apiUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(apiUrl)
                    toast.success("API URL copied")
                  } catch {
                    toast.error("Could not copy API URL")
                  }
                }}
              >
                Copy API URL
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            API URL unavailable. Set VITE_CONVEX_SITE_URL to enable it.
          </p>
        )}
      </section>
      <Dialog
        open={draft !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDraft(null)
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {draft?.record ? "Edit record" : "New record"}
            </DialogTitle>
            <DialogDescription>{collection.name}</DialogDescription>
          </DialogHeader>
          {draft && (
            <form onSubmit={submit} className="flex flex-col gap-4">
              {fields.map((field) => (
                <div
                  className={
                    field.type === "boolean"
                      ? "flex items-center gap-2"
                      : "grid gap-2"
                  }
                  key={field.id}
                >
                  {field.type === "multiSelect" && (
                    <MultiSelectFieldInput
                      id={`record-${field.id}`}
                      legend={fieldLabel(field)}
                      options={field.options}
                      value={draftOptions(draft.values[field.id])}
                      disabled={saving}
                      onChange={(options) =>
                        setDraft({
                          ...draft,
                          values: { ...draft.values, [field.id]: options },
                        })
                      }
                    />
                  )}
                  {field.type === "boolean" && (
                    <>
                      <Checkbox
                        disabled={saving}
                        id={`record-${field.id}`}
                        checked={draft.values[field.id] === true}
                        onCheckedChange={(checked) =>
                          setDraft({
                            ...draft,
                            values: {
                              ...draft.values,
                              [field.id]: checked === true,
                            },
                          })
                        }
                      />
                      <Label htmlFor={`record-${field.id}`}>
                        {field.label}
                      </Label>
                    </>
                  )}
                  {field.type !== "multiSelect" && field.type !== "boolean" && (
                    <>
                      <Label htmlFor={`record-${field.id}`}>
                        {fieldLabel(field)}
                      </Label>
                      {Match.value(field).pipe(
                        Match.when({ type: "select" }, (choice) => (
                          <SelectFieldInput
                            id={`record-${field.id}`}
                            options={choice.options.map((option) => ({
                              value: option,
                              label: option,
                            }))}
                            optional={field.optional === true}
                            value={String(draft.values[field.id] ?? "")}
                            disabled={saving}
                            onChange={(value) => setDraftValue(field.id, value)}
                          />
                        )),
                        Match.when({ type: "recordReference" }, (reference) => (
                          <RecordReferenceInput
                            id={`record-${field.id}`}
                            collectionId={reference.collectionId}
                            optional={field.optional === true}
                            value={String(draft.values[field.id] ?? "")}
                            disabled={saving}
                            onChange={(value) => setDraftValue(field.id, value)}
                          />
                        )),
                        Match.when({ type: "artifactReference" }, () => (
                          <ArtifactReferenceInput
                            id={`record-${field.id}`}
                            workspaceId={collection.workspaceId}
                            optional={field.optional === true}
                            value={String(draft.values[field.id] ?? "")}
                            disabled={saving}
                            onChange={(value) => setDraftValue(field.id, value)}
                          />
                        )),
                        Match.when({ type: "secretRef" }, () => (
                          <SecretRefInput
                            id={`record-${field.id}`}
                            workspaceId={collection.workspaceId}
                            optional={field.optional === true}
                            value={String(draft.values[field.id] ?? "")}
                            disabled={saving}
                            onChange={(value) => setDraftValue(field.id, value)}
                          />
                        )),
                        Match.when({ type: "object" }, () => (
                          <>
                            <textarea
                              id={`record-${field.id}`}
                              className="min-h-32 w-full rounded-md border bg-background p-3 font-mono text-sm"
                              rows={6}
                              spellCheck={false}
                              disabled={saving}
                              required={!field.optional}
                              value={String(draft.values[field.id] ?? "")}
                              onChange={(e) =>
                                setDraftValue(field.id, e.target.value)
                              }
                            />
                            <p className="text-sm text-muted-foreground">
                              A JSON object, nested at most {MAX_OBJECT_DEPTH}{" "}
                              levels deep.
                            </p>
                          </>
                        )),
                        Match.orElse(() => (
                          <Input
                            disabled={saving}
                            id={`record-${field.id}`}
                            type={inputType(field.type)}
                            step={inputStep(field.type)}
                            maxLength={
                              field.type === "text" ? 10000 : undefined
                            }
                            required={
                              !field.optional &&
                              inputType(field.type) !== "text"
                            }
                            value={String(draft.values[field.id] ?? "")}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                values: {
                                  ...draft.values,
                                  [field.id]: e.target.value,
                                },
                              })
                            }
                          />
                        ))
                      )}
                    </>
                  )}
                </div>
              ))}
              {conflict && draft.record && (
                <Alert variant="destructive">
                  <AlertTitle>This record changed</AlertTitle>
                  <AlertDescription>
                    Someone saved it after you opened it. Load the latest
                    version, then make your change again.
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving || !latest}
                      onClick={() => {
                        if (latest)
                          openDraft({
                            record: latest,
                            values: editValues(fields, latest.values),
                          })
                      }}
                    >
                      {latest === undefined ? "Loading…" : "Load latest"}
                    </Button>
                  </AlertAction>
                </Alert>
              )}
              {confirmingDelete && draft.record && (
                <Alert variant="destructive">
                  <AlertTitle>Delete this record?</AlertTitle>
                  <AlertDescription>
                    You cannot undo this. Agents and the API can no longer read
                    the record.
                  </AlertDescription>
                  <AlertAction>
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={saving}
                      onClick={deleteDraftRecord}
                    >
                      Delete
                    </Button>
                  </AlertAction>
                </Alert>
              )}
              {draft.record && (
                <RecordArtifacts
                  key={draft.record._id}
                  workspaceId={collection.workspaceId}
                  recordId={draft.record._id}
                />
              )}
              <DialogFooter>
                {draft.record && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-destructive sm:mr-auto"
                    disabled={saving || conflict || confirmingDelete}
                    onClick={() => setConfirmingDelete(true)}
                  >
                    <Trash2 aria-hidden />
                    Delete
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || conflict}>
                  {saving ? "Saving…" : "Save record"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** The field label, marked when a record may leave the field out. */
function fieldLabel(field: Field) {
  return (
    <>
      {field.label}
      {field.optional && (
        <span className="font-normal text-muted-foreground">(optional)</span>
      )}
    </>
  )
}

/** The chosen options of a multi-select draft value. */
function draftOptions(value: Draft["values"][string] | undefined): string[] {
  return Array.isArray(value) ? value : []
}

/**
 * The label of a referenced record or artifact. Shows the ID until the label
 * loads, and when the target is not in the workspace.
 */
function ReferenceLabel({
  collectionId,
  id,
}: {
  collectionId: Id<"collections">
  id: string
}) {
  const label = useQuery(api.workspaces.referenceLabel, { collectionId, id })
  return label === undefined || label === null ? (
    <span className="font-mono text-muted-foreground">{id}</span>
  ) : (
    <span title={id}>{label}</span>
  )
}

/**
 * Shows a stored value as text: booleans read as Yes or No, and timestamps
 * in local time.
 */
function formatValue(field: Field, value: Values[string] | undefined) {
  if (value === undefined) return ""
  if (field.type === "boolean") return value === true ? "Yes" : "No"
  if (field.type === "secretRef") return "Secret reference"
  if (field.type === "timestamp" && typeof value === "number")
    return new Date(value).toLocaleString()
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "number") return value.toLocaleString()
  return valueText(value)
}
