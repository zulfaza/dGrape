import { useQuery } from "convex/react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import {
  SelectFieldInput,
  type SelectItemOption,
} from "@/components/choice-field-input"

/**
 * Inputs that choose a reference target. Each lists the first page of
 * targets (at most 50), and keeps the current value in the list when it is
 * not on that page. Agents and the API can reference any target.
 */

const FIRST_PAGE = { numItems: 50, cursor: null }

/** Adds the current value when the page does not have it. */
function withCurrent(
  options: ReadonlyArray<SelectItemOption>,
  value: string
): SelectItemOption[] {
  return value === "" || options.some((option) => option.value === value)
    ? [...options]
    : [{ value, label: value }, ...options]
}

/** The target collection of a new record reference field. */
export function CollectionTargetInput({
  id,
  workspaceId,
  value,
  disabled,
  onChange,
}: {
  id: string
  workspaceId: string
  value: Id<"collections"> | null
  disabled: boolean
  onChange: (value: Id<"collections">) => void
}) {
  const collections = useQuery(api.workspaces.listCollections, {
    workspaceId,
    paginationOpts: FIRST_PAGE,
  })
  const page = collections?.page ?? []
  return (
    <SelectFieldInput
      id={id}
      options={page.map((collection) => ({
        value: collection._id,
        label: collection.name,
      }))}
      optional={false}
      value={value ?? ""}
      disabled={disabled || collections === undefined}
      onChange={(next) => {
        const target = page.find((collection) => collection._id === next)
        if (target) onChange(target._id)
      }}
    />
  )
}

/** A short name for a record: its first text value, or its ID. */
function recordLabel(
  fields: ReadonlyArray<Doc<"collections">["definition"]["fields"][number]>,
  record: Doc<"collectionRecords">
): string {
  for (const field of fields) {
    const value = record.values[field.id]
    if (field.type === "text" && value !== undefined && value !== "")
      return String(value)
  }
  return record._id
}

/** The record form input of a record reference field. */
export function RecordReferenceInput({
  id,
  collectionId,
  optional,
  value,
  disabled,
  onChange,
}: {
  id: string
  collectionId: Id<"collections">
  optional: boolean
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const target = useQuery(api.workspaces.getCollection, { collectionId })
  const records = useQuery(api.workspaces.listRecords, {
    collectionId,
    paginationOpts: FIRST_PAGE,
  })
  const fields = target?.definition.fields ?? []
  return (
    <SelectFieldInput
      id={id}
      options={withCurrent(
        (records?.page ?? []).map((record) => ({
          value: record._id,
          label: recordLabel(fields, record),
        })),
        value
      )}
      optional={optional}
      value={value}
      disabled={disabled || records === undefined}
      onChange={onChange}
    />
  )
}

/** The record form input of an artifact reference field. */
export function ArtifactReferenceInput({
  id,
  workspaceId,
  optional,
  value,
  disabled,
  onChange,
}: {
  id: string
  workspaceId: Id<"workspaces">
  optional: boolean
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const artifacts = useQuery(api.artifacts.list, {
    workspaceId,
    paginationOpts: FIRST_PAGE,
  })
  return (
    <SelectFieldInput
      id={id}
      options={withCurrent(
        (artifacts?.page ?? []).map((artifact) => ({
          value: artifact._id,
          label: artifact.name,
        })),
        value
      )}
      optional={optional}
      value={value}
      disabled={disabled || artifacts === undefined}
      onChange={onChange}
    />
  )
}
