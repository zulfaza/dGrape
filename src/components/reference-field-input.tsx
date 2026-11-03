import { usePaginatedQuery, useQuery } from "convex/react"
import type { ReactNode } from "react"
import { api } from "../../convex/_generated/api"
import type { Doc, Id } from "../../convex/_generated/dataModel"
import {
  SelectFieldInput,
  type SelectItemOption,
} from "@/components/choice-field-input"
import { Button } from "@/components/ui/button"

/**
 * Inputs that choose a reference target. Each lists targets one page (50)
 * at a time, with a button that loads the next page, and keeps the current
 * value in the list when no loaded page has it.
 */

const PAGE_SIZE = 50

/** The select, and a "Load more" button while more targets exist. */
function PagedSelect({
  canLoadMore,
  onLoadMore,
  children,
}: {
  canLoadMore: boolean
  onLoadMore: () => void
  children: ReactNode
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      {canLoadMore && (
        <Button type="button" variant="outline" size="sm" onClick={onLoadMore}>
          Load more
        </Button>
      )}
    </div>
  )
}

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
  const collections = usePaginatedQuery(
    api.workspaces.listCollections,
    { workspaceId },
    { initialNumItems: PAGE_SIZE }
  )
  const page = collections.results
  return (
    <PagedSelect
      canLoadMore={collections.status === "CanLoadMore"}
      onLoadMore={() => collections.loadMore(PAGE_SIZE)}
    >
      <SelectFieldInput
        id={id}
        options={page.map((collection) => ({
          value: collection._id,
          label: collection.name,
        }))}
        optional={false}
        value={value ?? ""}
        disabled={disabled || collections.status === "LoadingFirstPage"}
        onChange={(next) => {
          const target = page.find((collection) => collection._id === next)
          if (target) onChange(target._id)
        }}
      />
    </PagedSelect>
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
  const records = usePaginatedQuery(
    api.workspaces.listRecords,
    { collectionId },
    { initialNumItems: PAGE_SIZE }
  )
  const fields = target?.definition.fields ?? []
  return (
    <PagedSelect
      canLoadMore={records.status === "CanLoadMore"}
      onLoadMore={() => records.loadMore(PAGE_SIZE)}
    >
      <SelectFieldInput
        id={id}
        options={withCurrent(
          records.results.map((record) => ({
            value: record._id,
            label: recordLabel(fields, record),
          })),
          value
        )}
        optional={optional}
        value={value}
        disabled={disabled || records.status === "LoadingFirstPage"}
        onChange={onChange}
      />
    </PagedSelect>
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
  const artifacts = usePaginatedQuery(
    api.artifacts.list,
    { workspaceId },
    { initialNumItems: PAGE_SIZE }
  )
  return (
    <PagedSelect
      canLoadMore={artifacts.status === "CanLoadMore"}
      onLoadMore={() => artifacts.loadMore(PAGE_SIZE)}
    >
      <SelectFieldInput
        id={id}
        options={withCurrent(
          artifacts.results.map((artifact) => ({
            value: artifact._id,
            label: artifact.name,
          })),
          value
        )}
        optional={optional}
        value={value}
        disabled={disabled || artifacts.status === "LoadingFirstPage"}
        onChange={onChange}
      />
    </PagedSelect>
  )
}
