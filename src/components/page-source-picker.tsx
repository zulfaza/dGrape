import { useQuery } from "convex/react"
import { useId, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  chartTypes,
  type ChartSpec,
  type ChartType,
  type PageBlock,
} from "../../convex/lib/pageDomain"
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "./ui/field"
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

const chartTypeLabels: Record<ChartType, string> = {
  bar: "Bar",
  line: "Line",
  area: "Area",
  pie: "Pie",
  scatter: "Scatter",
}

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
  const [chartType, setChartType] = useState<ChartType>("bar")
  const [labelField, setLabelField] = useState("")
  const [valueField, setValueField] = useState("")
  const [xField, setXField] = useState("")
  const [xUnit, setXUnit] = useState("")
  const xUnitId = useId()
  const source = sources?.find((item) => item.queryId === queryId)
  const numeric = source?.fields.find(
    (field) => fields.includes(field.id) && field.type === "number"
  )
  const numericFields =
    source?.fields.filter((field) => field.type === "number") ?? []
  const isNumeric = (id: string) => numericFields.some((f) => f.id === id)
  const chart: ChartSpec | null =
    !source?.fields.some((field) => field.id === labelField) ||
    !isNumeric(valueField)
      ? null
      : chartType === "scatter"
        ? isNumeric(xField)
          ? { type: chartType, labelField, xField, xUnit, valueField, unit }
          : null
        : { type: chartType, labelField, valueField, unit }
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
          setLabelField("")
          setValueField("")
          setXField("")
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
        Metric / chart unit
        <Input
          value={unit}
          maxLength={100}
          onChange={(event) => setUnit(event.target.value)}
        />
      </label>
      <FieldSet disabled={disabled}>
        <FieldLegend>Chart</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel>Chart type</FieldLabel>
            <Select
              value={chartType}
              onValueChange={(value) => {
                const type = chartTypes.find((item) => item === value)
                if (type) setChartType(type)
              }}
            >
              <SelectTrigger aria-label="Chart type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {chartTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {chartTypeLabels[type]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel>
              {chartType === "scatter" ? "Point label field" : "Label field"}
            </FieldLabel>
            <Select
              value={labelField}
              onValueChange={(value) => setLabelField(value ?? "")}
            >
              <SelectTrigger aria-label="Label field">
                <SelectValue placeholder="Select label field" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {source?.fields.map((field) => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {chartType === "scatter" && (
            <>
              <Field>
                <FieldLabel>X field</FieldLabel>
                <Select
                  value={xField}
                  onValueChange={(value) => setXField(value ?? "")}
                >
                  <SelectTrigger aria-label="X field">
                    <SelectValue placeholder="Select numeric field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {numericFields.map((field) => (
                        <SelectItem key={field.id} value={field.id}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={xUnitId}>X unit</FieldLabel>
                <Input
                  id={xUnitId}
                  value={xUnit}
                  maxLength={100}
                  onChange={(event) => setXUnit(event.target.value)}
                />
              </Field>
            </>
          )}
          <Field>
            <FieldLabel>
              {chartType === "scatter" ? "Y field" : "Value field"}
            </FieldLabel>
            <Select
              value={valueField}
              onValueChange={(value) => setValueField(value ?? "")}
            >
              <SelectTrigger aria-label="Value field">
                <SelectValue placeholder="Select numeric field" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {numericFields.map((field) => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button
            disabled={disabled || !title.trim() || !chart}
            onClick={() => {
              if (source && chart)
                add({
                  kind: "chart",
                  title,
                  binding: {
                    queryId: source.queryId,
                    revision: source.revision,
                  },
                  chart,
                })
            }}
          >
            Add chart
          </Button>
        </FieldGroup>
      </FieldSet>
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
