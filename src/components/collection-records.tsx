import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import type { RecordQuery } from "../../convex/lib/recordQuery"
import { ChevronLeft, Plus, Trash2 } from "lucide-react"
import { AddFieldDialog } from "@/components/add-field-dialog"
import { ExportRecordsButton } from "@/components/export-records-button"
import { Mascot } from "@/components/mascot"
import { RecordQueryBar } from "@/components/record-query-bar"
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
      field.type === "boolean"
        ? false
        : field.type === "number" && !field.optional
          ? "0"
          : "",
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
      if (field.optional && (value === undefined || value === "")) continue
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
  const openDraft = (next: Draft) => {
    setConflict(false)
    setConfirmingDelete(false)
    setDraft(next)
  }
  const newRecordButton = (
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
              <AddFieldDialog
                collectionId={collectionId}
                fields={fields}
                disabled={saving}
              />
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
                read-and-write credential.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>{newRecordButton}</EmptyContent>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {fields.map((field) => (
                  <TableHead
                    key={field.id}
                    className={
                      field.type === "number" ? "px-4 text-right" : "px-4"
                    }
                  >
                    {field.label}
                  </TableHead>
                ))}
                <TableHead className="px-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((record) => (
                <TableRow key={record._id}>
                  {fields.map((field) => (
                    <TableCell
                      key={field.id}
                      className={
                        field.type === "number"
                          ? "px-4 py-3 text-right tabular-nums"
                          : "max-w-80 truncate px-4 py-3"
                      }
                    >
                      {formatValue(field, record.values[field.id])}
                    </TableCell>
                  ))}
                  <TableCell className="w-0 px-4 py-2 text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() =>
                        openDraft({ record, values: editValues(record.values) })
                      }
                    >
                      Edit
                    </Button>
                  </TableCell>
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
                  {field.type === "boolean" ? (
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
                  ) : (
                    <>
                      <Label htmlFor={`record-${field.id}`}>
                        {field.label}
                        {field.optional && (
                          <span className="font-normal text-muted-foreground">
                            (optional)
                          </span>
                        )}
                      </Label>
                      <Input
                        disabled={saving}
                        id={`record-${field.id}`}
                        type={field.type === "number" ? "number" : "text"}
                        step={field.type === "number" ? "any" : undefined}
                        maxLength={field.type === "text" ? 10000 : undefined}
                        required={field.type === "number" && !field.optional}
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
                            values: editValues(latest.values),
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

/** Shows a stored value as text; booleans read as Yes or No. */
function formatValue(field: Field, value: Values[string] | undefined) {
  if (value === undefined) return ""
  if (field.type === "boolean") return value === true ? "Yes" : "No"
  if (typeof value === "number") return value.toLocaleString()
  return String(value)
}
