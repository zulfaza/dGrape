import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import {
  ChartColumn,
  ChartPie,
  Hash,
  Table2,
  Type,
  type LucideIcon,
} from "lucide-react"
import { useId, useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { isNumericField } from "../../convex/lib/collectionDomain"
import { type ChartSpec, type PageBlock } from "../../convex/lib/pageDomain"
import { Button } from "./ui/button"
import { Checkbox } from "./ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "./ui/field"
import { Input } from "./ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select"

/** The panel types that people can add. Pie is a chart with type pie. */
const panelTypes = [
  { type: "stat", label: "Stat", icon: Hash },
  { type: "chart", label: "Chart", icon: ChartColumn },
  { type: "pie", label: "Pie", icon: ChartPie },
  { type: "table", label: "Table", icon: Table2 },
  { type: "text", label: "Text", icon: Type },
] as const satisfies readonly {
  type: string
  label: string
  icon: LucideIcon
}[]
type PanelType = (typeof panelTypes)[number]["type"]

const lineChartTypes = [
  { type: "bar", label: "Bar" },
  { type: "line", label: "Line" },
  { type: "area", label: "Area" },
  { type: "scatter", label: "Scatter" },
] as const
type LineChartType = (typeof lineChartTypes)[number]["type"]

/** The form values of every panel type, so switching type keeps them. */
type Form = {
  type: PanelType
  title: string
  queryId: string
  text: string
  unit: string
  operation: "count" | "sum"
  field: string
  fields: string[]
  chartType: LineChartType
  labelField: string
  valueField: string
  xField: string
  xUnit: string
}

const emptyForm: Form = {
  type: "stat",
  title: "",
  queryId: "",
  text: "",
  unit: "",
  operation: "count",
  field: "",
  fields: [],
  chartType: "bar",
  labelField: "",
  valueField: "",
  xField: "",
  xUnit: "",
}

/** The form for an existing block, so Edit opens with its values. */
function formOf(block: PageBlock): Form {
  switch (block.kind) {
    case "markdown":
      return { ...emptyForm, type: "text", text: block.text }
    case "metric":
      return {
        ...emptyForm,
        type: "stat",
        title: block.title,
        queryId: block.binding.queryId,
        unit: block.unit,
        operation: block.operation,
        field: block.field,
      }
    case "table":
      return {
        ...emptyForm,
        type: "table",
        title: block.title,
        queryId: block.binding.queryId,
        fields: block.fields,
      }
    case "chart": {
      const chart = block.chart
      const base = {
        ...emptyForm,
        title: block.title,
        queryId: block.binding.queryId,
        unit: chart.unit,
        labelField: chart.labelField,
        valueField: chart.valueField,
      }
      if (chart.type === "pie") return { ...base, type: "pie" }
      if (chart.type === "scatter")
        return {
          ...base,
          type: "chart",
          chartType: "scatter",
          xField: chart.xField,
          xUnit: chart.xUnit,
        }
      return { ...base, type: "chart", chartType: chart.type }
    }
    // The panel menu offers no Edit for file and HTML report panels.
    case "artifact":
    case "htmlReport":
      return { ...emptyForm, title: block.title }
  }
}

type Binding = Extract<PageBlock, { binding: unknown }>["binding"]

/** The query revision that an edited panel is pinned to, if any. */
function pinOf(block: PageBlock | null): Binding | null {
  return block && "binding" in block ? block.binding : null
}

/**
 * Adds a panel (`block` null) or edits one. The dialog asks for the panel
 * type first, then the source and fields, and returns a complete block.
 */
export function PanelDialog({
  workspaceId,
  open,
  onOpenChange,
  block,
  onSubmit,
}: {
  workspaceId: Id<"workspaces">
  open: boolean
  onOpenChange: (open: boolean) => void
  block: PageBlock | null
  onSubmit: (block: PageBlock) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto sm:max-w-lg">
        {open && (
          <PanelForm
            workspaceId={workspaceId}
            block={block}
            onSubmit={(next) => {
              onSubmit(next)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PanelForm({
  workspaceId,
  block,
  onSubmit,
  onCancel,
}: {
  workspaceId: Id<"workspaces">
  block: PageBlock | null
  onSubmit: (block: PageBlock) => void
  onCancel: () => void
}) {
  const sources = useQuery(api.pages.sources, { workspaceId })
  const [form, setForm] = useState<Form>(block ? formOf(block) : emptyForm)
  // An edited panel keeps its query revision until the user picks a source.
  const [pin, setPin] = useState(() => pinOf(block))
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch })
  const ids = { title: useId(), text: useId(), unit: useId(), xUnit: useId() }
  const source = sources?.find((item) => item.queryId === form.queryId)
  const pinned = useQuery(
    api.pages.sourceRevision,
    pin ? { workspaceId, queryId: pin.queryId, revision: pin.revision } : "skip"
  )
  // A pinned panel offers only the fields of its revision, so the save
  // accepts every field the user picks.
  const fields = pin ? (pinned ?? []) : (source?.fields ?? [])
  const numericFields = fields.filter((field) => isNumericField(field.type))
  // Columns the panel shows that the source list does not have stay visible,
  // so the user sees and can clear them.
  const columns = [
    ...fields,
    ...form.fields
      .filter((id) => !fields.some((field) => field.id === id))
      .map((id) => ({ id, label: id })),
  ]
  // Null until the fields are known. The field controls and Apply wait for it.
  // A pinned panel needs no entry in the source list.
  const binding = pin
    ? pinned
      ? pin
      : null
    : source && { queryId: source.queryId, revision: source.revision }
  const result = buildBlock(form, binding ? { binding, fields } : null)
  const editing = block !== null
  const fieldSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    numeric: boolean
  ) => (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder="Select field" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {(numeric ? numericFields : fields).map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  )
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (result) onSubmit(result)
      }}
    >
      <DialogHeader>
        <DialogTitle>{editing ? "Edit panel" : "Add panel"}</DialogTitle>
        <DialogDescription>
          {form.type === "text"
            ? "Write the text in Markdown."
            : "Show live data from a saved query."}
        </DialogDescription>
      </DialogHeader>
      {!editing && (
        <FieldSet>
          <FieldLegend variant="label">Panel type</FieldLegend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {panelTypes.map(({ type, label, icon: Icon }) => (
              <Button
                key={type}
                type="button"
                variant={form.type === type ? "secondary" : "outline"}
                aria-pressed={form.type === type}
                onClick={() => set({ type })}
              >
                <Icon aria-hidden />
                {label}
              </Button>
            ))}
          </div>
        </FieldSet>
      )}
      {form.type === "text" ? (
        <Field>
          <FieldLabel htmlFor={ids.text}>Markdown</FieldLabel>
          <textarea
            id={ids.text}
            data-slot="textarea"
            className="min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm"
            value={form.text}
            onChange={(event) => set({ text: event.target.value })}
          />
        </Field>
      ) : (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={ids.title}>Title</FieldLabel>
            <Input
              id={ids.title}
              maxLength={100}
              value={form.title}
              onChange={(event) => set({ title: event.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel>Source</FieldLabel>
            <Select
              value={form.queryId}
              onValueChange={(queryId) => {
                setPin(null)
                set({
                  queryId,
                  field: "",
                  fields: [],
                  labelField: "",
                  valueField: "",
                  xField: "",
                })
              }}
            >
              <SelectTrigger aria-label="Source">
                <SelectValue
                  placeholder={
                    sources === undefined ? "Loading…" : "Select saved query"
                  }
                />
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
            {pin && (
              <FieldDescription>
                Uses revision {pin.revision}.{" "}
                {source && source.revision !== pin.revision && (
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onClick={() => setPin(null)}
                  >
                    Use revision {source.revision}
                  </Button>
                )}
              </FieldDescription>
            )}
            {sources?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No saved queries yet. Save a query in Data first.
              </p>
            )}
          </Field>
          {binding && form.type === "stat" && (
            <>
              <Field>
                <FieldLabel>Value</FieldLabel>
                <Select
                  value={form.operation}
                  onValueChange={(operation) =>
                    set({ operation: operation === "sum" ? "sum" : "count" })
                  }
                >
                  <SelectTrigger aria-label="Value">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="count">Record count</SelectItem>
                      <SelectItem value="sum">Sum of a field</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              {form.operation === "sum" &&
                fieldSelect(
                  "Field",
                  form.field,
                  (field) => set({ field }),
                  true
                )}
            </>
          )}
          {binding && form.type === "chart" && (
            <Field>
              <FieldLabel>Chart type</FieldLabel>
              <Select
                value={form.chartType}
                onValueChange={(value) => {
                  const found = lineChartTypes.find(
                    (item) => item.type === value
                  )
                  if (found) set({ chartType: found.type })
                }}
              >
                <SelectTrigger aria-label="Chart type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {lineChartTypes.map((item) => (
                      <SelectItem key={item.type} value={item.type}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          )}
          {binding && (form.type === "chart" || form.type === "pie") && (
            <>
              {fieldSelect(
                form.chartType === "scatter" && form.type === "chart"
                  ? "Point label"
                  : "Label",
                form.labelField,
                (labelField) => set({ labelField }),
                false
              )}
              {form.type === "chart" &&
                form.chartType === "scatter" &&
                fieldSelect(
                  "X value",
                  form.xField,
                  (xField) => set({ xField }),
                  true
                )}
              {form.type === "chart" && form.chartType === "scatter" && (
                <Field>
                  <FieldLabel htmlFor={ids.xUnit}>X unit</FieldLabel>
                  <Input
                    id={ids.xUnit}
                    maxLength={100}
                    value={form.xUnit}
                    onChange={(event) => set({ xUnit: event.target.value })}
                  />
                </Field>
              )}
              {fieldSelect(
                form.chartType === "scatter" && form.type === "chart"
                  ? "Y value"
                  : "Value",
                form.valueField,
                (valueField) => set({ valueField }),
                true
              )}
            </>
          )}
          {binding && form.type === "table" && (
            <FieldSet>
              <FieldLegend variant="label">Columns</FieldLegend>
              <div className="flex flex-col gap-2">
                {columns.map((field) => (
                  <Field key={field.id} orientation="horizontal">
                    <Checkbox
                      id={`${ids.title}-${field.id}`}
                      checked={form.fields.includes(field.id)}
                      onCheckedChange={(checked) =>
                        set({
                          fields:
                            checked === true
                              ? [...form.fields, field.id]
                              : form.fields.filter((id) => id !== field.id),
                        })
                      }
                    />
                    <FieldLabel htmlFor={`${ids.title}-${field.id}`}>
                      {field.label}
                    </FieldLabel>
                  </Field>
                ))}
              </div>
            </FieldSet>
          )}
          {binding && form.type !== "table" && (
            <Field>
              <FieldLabel htmlFor={ids.unit}>Unit</FieldLabel>
              <Input
                id={ids.unit}
                maxLength={100}
                placeholder="Optional, such as USD"
                value={form.unit}
                onChange={(event) => set({ unit: event.target.value })}
              />
            </Field>
          )}
        </FieldGroup>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!result}>
          {editing ? "Apply" : "Add panel"}
        </Button>
      </DialogFooter>
    </form>
  )
}

type Source = FunctionReturnType<typeof api.pages.sources>[number]

/** The binding of the block to build, and the fields it may use. */
type Target = { binding: Binding; fields: readonly Source["fields"][number][] }

/** The block the form describes, or null while it is incomplete. */
function buildBlock(form: Form, target: Target | null): PageBlock | null {
  if (form.type === "text") return { kind: "markdown", text: form.text }
  const title = form.title.trim()
  if (!title || !target) return null
  const { binding, fields } = target
  const has = (id: string) => fields.some((field) => field.id === id)
  const numeric = (id: string) =>
    fields.some((field) => field.id === id && isNumericField(field.type))
  switch (form.type) {
    case "stat":
      if (form.operation === "sum" && !numeric(form.field)) return null
      return {
        kind: "metric",
        title,
        binding,
        operation: form.operation,
        field: form.operation === "sum" ? form.field : "",
        unit: form.unit,
      }
    case "table": {
      const columns = form.fields
      return columns.length < 1 || columns.length > 20 || !columns.every(has)
        ? null
        : { kind: "table", title, binding, fields: columns }
    }
    case "chart":
    case "pie": {
      if (!has(form.labelField) || !numeric(form.valueField)) return null
      const chart: ChartSpec | null =
        form.type === "pie"
          ? {
              type: "pie",
              labelField: form.labelField,
              valueField: form.valueField,
              unit: form.unit,
            }
          : form.chartType === "scatter"
            ? numeric(form.xField)
              ? {
                  type: "scatter",
                  labelField: form.labelField,
                  xField: form.xField,
                  xUnit: form.xUnit,
                  valueField: form.valueField,
                  unit: form.unit,
                }
              : null
            : {
                type: form.chartType,
                labelField: form.labelField,
                valueField: form.valueField,
                unit: form.unit,
              }
      return chart && { kind: "chart", title, binding, chart }
    }
  }
}
