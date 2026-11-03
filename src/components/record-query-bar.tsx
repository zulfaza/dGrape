import { checkRecordValues } from "../../convex/lib/collectionDomain"
import { useState, type FormEvent } from "react"
import type { Doc } from "../../convex/_generated/dataModel"
import type { RecordQuery } from "../../convex/lib/recordQuery"
import { Button } from "@/components/ui/button"
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
import { fromInputText, inputStep, inputType } from "@/lib/field-types"

type Field = Doc<"collections">["definition"]["fields"][number]
type Order = RecordQuery["order"]

/** The select value for "no indexed field": records in the order added. */
const ADDED = "__added"

function isOrder(value: string): value is Order {
  return value === "asc" || value === "desc"
}

/**
 * Sorts and filters records by one indexed field. It reports `null` for the
 * default list (all records in the order added). Only indexed fields are
 * offered, because only they have an index to read.
 */
export function RecordQueryBar({
  fields,
  query,
  onChange,
}: {
  fields: ReadonlyArray<Field>
  query: RecordQuery | null
  onChange: (query: RecordQuery | null) => void
}) {
  const indexed = fields.filter((field) => field.indexed)
  const field = indexed.find((f) => f.id === query?.fieldId)
  const [filterText, setFilterText] = useState("")
  if (indexed.length === 0) return null

  const selectField = (fieldId: string) => {
    setFilterText("")
    onChange(
      fieldId === ADDED ? null : { fieldId, order: query?.order ?? "asc" }
    )
  }

  function applyFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!query || !field) return
    if (filterText === "") {
      onChange({ fieldId: query.fieldId, order: query.order })
      return
    }
    const parsed = fromInputText(field.type, filterText)
    if (!parsed.ok) {
      toast.error(parsed.message)
      return
    }
    const checked = checkRecordValues([field], { [field.id]: parsed.value })
    if (!checked.ok) {
      toast.error(checked.message)
      return
    }
    onChange({ ...query, where: { eq: parsed.value } })
  }

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-2">
        <Label htmlFor="query-field">Sort by</Label>
        <Select value={query?.fieldId ?? ADDED} onValueChange={selectField}>
          <SelectTrigger id="query-field" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value={ADDED}>Order added</SelectItem>
              {indexed.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {query && field && (
        <>
          <div className="grid gap-2">
            <Label htmlFor="query-order">Order</Label>
            <Select
              value={query.order}
              onValueChange={(value) => {
                if (isOrder(value)) onChange({ ...query, order: value })
              }}
            >
              <SelectTrigger id="query-order" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="asc">Ascending</SelectItem>
                  <SelectItem value="desc">Descending</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {field.type === "boolean" ? (
            <div className="grid gap-2">
              <Label htmlFor="query-equals">Show</Label>
              <Select
                value={
                  query.where && "eq" in query.where
                    ? String(query.where.eq)
                    : "any"
                }
                onValueChange={(value) =>
                  onChange(
                    value === "any"
                      ? { fieldId: query.fieldId, order: query.order }
                      : { ...query, where: { eq: value === "true" } }
                  )
                }
              >
                <SelectTrigger id="query-equals" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="any">All</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                    <SelectItem value="false">No</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <form onSubmit={applyFilter} className="flex items-end gap-2">
              <div className="grid gap-2">
                <Label htmlFor="query-equals">Equals</Label>
                <Input
                  id="query-equals"
                  className="w-44"
                  type={inputType(field.type)}
                  step={inputStep(field.type)}
                  maxLength={200}
                  placeholder="Any value"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                />
              </div>
              <Button type="submit" variant="outline">
                Filter
              </Button>
            </form>
          )}
        </>
      )}
    </div>
  )
}
