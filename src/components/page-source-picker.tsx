import { useQuery } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { PageBlock } from "../../convex/lib/pageDomain"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"

export function PageSourcePicker({
  workspaceId,
  disabled,
  add,
}: {
  workspaceId: Id<"workspaces">
  disabled: boolean
  add: (block: PageBlock) => void
}) {
  const sources = useQuery(api.pages.sources, { workspaceId })
  const [queryId, setQueryId] = useState<Id<"queryDefinitions"> | null>(null)
  const [fields, setFields] = useState<string[]>([])
  const [title, setTitle] = useState("Live data")
  const [unit, setUnit] = useState("")
  const source = sources?.find((item) => item.queryId === queryId)
  const numeric = source?.fields.find(
    (field) => fields.includes(field.id) && field.type === "number"
  )
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded-md border p-3">
      <legend>Add live block</legend>
      <label>
        Block title
        <Input
          value={title}
          maxLength={100}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <Select
        value={queryId ?? ""}
        onValueChange={(value) => {
          const selected = sources?.find((item) => item.queryId === value)
          setQueryId(selected?.queryId ?? null)
          setFields([])
        }}
      >
        <SelectTrigger aria-label="Saved query" disabled={disabled}>
          <SelectValue placeholder="Select saved query" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {sources?.map((item) => (
              <SelectItem key={item.queryId} value={item.queryId}>
                {item.name} · revision {item.revision}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <p>
        {sources === undefined
          ? "Loading sources…"
          : "Showing up to 50 current, valid saved queries."}
      </p>
      {source?.fields.map((field) => (
        <label key={field.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={fields.includes(field.id)}
            onChange={(event) =>
              setFields(
                event.target.checked
                  ? [...fields, field.id]
                  : fields.filter((id) => id !== field.id)
              )
            }
          />
          {field.label} ({field.type})
        </label>
      ))}
      <label>
        Metric unit
        <Input
          value={unit}
          maxLength={100}
          onChange={(event) => setUnit(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={
            disabled ||
            !source ||
            !title.trim() ||
            fields.length === 0 ||
            fields.length > 20
          }
          onClick={() => {
            if (source)
              add({
                kind: "table",
                title,
                binding: { queryId: source.queryId, revision: source.revision },
                fields,
              })
          }}
        >
          Add table
        </Button>
        <Button
          disabled={disabled || !source || !title.trim()}
          onClick={() => {
            if (source)
              add({
                kind: "metric",
                title,
                binding: { queryId: source.queryId, revision: source.revision },
                operation: "count",
                field: "",
                unit,
              })
          }}
        >
          Add count metric
        </Button>
        <Button
          disabled={disabled || !source || !numeric || !title.trim()}
          onClick={() => {
            if (source && numeric)
              add({
                kind: "metric",
                title,
                binding: { queryId: source.queryId, revision: source.revision },
                operation: "sum",
                field: numeric.id,
                unit,
              })
          }}
        >
          Add sum metric
        </Button>
      </div>
      <p>
        Sum uses the first selected numeric field. Save changes to load live
        values.
      </p>
    </fieldset>
  )
}
