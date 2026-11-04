import { useMemo } from "react"
import { Chart } from "@tanstack/charts/react"
import { defineChart } from "@tanstack/charts/scene"
import { areaY } from "@tanstack/charts/area"
import { barY } from "@tanstack/charts/bar"
import { lineY } from "@tanstack/charts/line"
import { dot } from "@tanstack/charts/dot"
import { pie, polar, radialArc } from "@tanstack/charts/polar"
import { scaleBand } from "@tanstack/charts/scales/band"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { tooltip } from "@tanstack/charts/tooltip"
import type { ChartSpec, PageBlock } from "../../convex/lib/pageDomain"
import type { RecordValue } from "../../convex/lib/collectionDomain"
import { valueText } from "../lib/field-types"

type ChartBlock = Extract<PageBlock, { kind: "chart" }>
type CategorySpec = Exclude<ChartSpec, { type: "scatter" }>
type ScatterSpec = Extract<ChartSpec, { type: "scatter" }>
type Row = { _id: string; values: Record<string, RecordValue> }
type Field = { id: string; label: string }
type CategoryPoint = ReturnType<typeof chartRows>[number]
type ScatterPoint = ReturnType<typeof scatterRows>[number]

const keyboardHelp =
  "Use arrow keys to inspect points, Enter to pin details, Escape to dismiss."
/** Pie slices cycle through the shared chart tokens. */
const sliceColors = [1, 2, 3, 4, 5].map((n) => `var(--chart-${n})`)
const sliceColor = (index: number) =>
  sliceColors[index % sliceColors.length] ?? "var(--primary)"

function finite(value: RecordValue | undefined) {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Numeric chart geometry requires finite stored numbers.
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function rowLabel(value: RecordValue | undefined) {
  return value === undefined ? "Missing label" : valueText(value)
}

function fieldLabel(fields: Field[], id: string) {
  return fields.find((f) => f.id === id)?.label ?? id
}

const withUnit = (value: number, unit: string) =>
  unit ? `${value} ${unit}` : String(value)

/**
 * Preserve source order and identity; never coerce missing values to zero.
 * Pie slices cannot show negative values, so a pie marks them invalid.
 */
export function chartRows(rows: Row[], spec: CategorySpec) {
  return rows.map((row, index) => {
    const value = finite(row.values[spec.valueField])
    return {
      id: row._id,
      index,
      label: rowLabel(row.values[spec.labelField]),
      value: spec.type === "pie" && value !== null && value < 0 ? null : value,
    }
  })
}

/** A scatter point is valid only when both coordinates are finite numbers. */
export function scatterRows(rows: Row[], spec: ScatterSpec) {
  return rows.map((row) => ({
    id: row._id,
    label: rowLabel(row.values[spec.labelField]),
    x: finite(row.values[spec.xField]),
    value: finite(row.values[spec.valueField]),
  }))
}

export function PageChart({
  block,
  rows,
  fields,
}: {
  block: ChartBlock
  rows: Row[]
  fields: Field[]
}) {
  const spec = block.chart
  return spec.type === "scatter" ? (
    <ScatterChart title={block.title} spec={spec} rows={rows} fields={fields} />
  ) : (
    <CategoryChart
      title={block.title}
      spec={spec}
      rows={rows}
      fields={fields}
    />
  )
}

function CategoryChart({
  title,
  spec,
  rows,
  fields,
}: {
  title: string
  spec: CategorySpec
  rows: Row[]
  fields: Field[]
}) {
  const data = useMemo(() => chartRows(rows, spec), [rows, spec])
  const valueLabel = fieldLabel(fields, spec.valueField)
  const labelLabel = fieldLabel(fields, spec.labelField)
  const definition = useMemo(
    () => categoryDefinition(spec, data, labelLabel, valueLabel),
    [spec, data, labelLabel, valueLabel]
  )
  const missing = data.filter((row) => row.value === null).length
  const pieTotal = data.reduce((sum, row) => sum + (row.value ?? 0), 0)
  return (
    <div className="flex flex-col gap-3">
      {missing > 0 && (
        <p role="status">
          {missing} missing or invalid numeric values
          {spec.type === "pie" ? " (pie values must be zero or more)" : ""};
          gaps are not zero.
        </p>
      )}
      {data.length === 0 ? (
        <p>No matching records.</p>
      ) : data.length === missing ? (
        <p>No numeric values to chart.</p>
      ) : spec.type === "pie" && pieTotal === 0 ? (
        <p>All values are zero; there are no slices to show.</p>
      ) : (
        <Chart
          definition={definition}
          height={300}
          ariaLabel={`${title}: ${spec.type} chart of ${valueLabel} by ${labelLabel}`}
          ariaDescription={`${keyboardHelp} Values follow saved query order.`}
        />
      )}
      {spec.type === "pie" && pieTotal > 0 && (
        <ul aria-label={`${title} legend`} className="flex flex-wrap gap-3">
          {data.map((row) =>
            row.value === null ? null : (
              <li key={row.id} className="flex items-center gap-1">
                <svg aria-hidden className="size-3" viewBox="0 0 12 12">
                  <rect
                    width="12"
                    height="12"
                    rx="2"
                    fill={sliceColor(row.index)}
                  />
                </svg>
                {row.label}
              </li>
            )
          )}
        </ul>
      )}
      <details>
        <summary>View data table</summary>
        <table className="w-full text-left">
          <caption>{title} · source values</caption>
          <thead>
            <tr>
              <th scope="col">{labelLabel}</th>
              <th scope="col">
                {valueLabel} {spec.unit}
              </th>
              {spec.type === "pie" && <th scope="col">Share</th>}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                <td>
                  {row.value === null
                    ? "Missing or invalid numeric value"
                    : withUnit(row.value, spec.unit)}
                </td>
                {spec.type === "pie" && (
                  <td>
                    {row.value === null || pieTotal === 0
                      ? "—"
                      : `${((row.value / pieTotal) * 100).toFixed(1)}%`}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/** Translate a category ChartSpec into a TanStack Charts definition. */
function categoryDefinition(
  spec: CategorySpec,
  data: CategoryPoint[],
  labelLabel: string,
  valueLabel: string
) {
  const valid = data.flatMap((row) =>
    row.value === null ? [] : [{ ...row, value: row.value }]
  )
  const tooltipSpec = {
    use: tooltip,
    sticky: true,
    content: (
      points: readonly { datum: { label: string; value: number | null } }[]
    ) => ({
      title: points[0]?.datum.label ?? "",
      rows: points.map((point) => ({
        label: valueLabel,
        value:
          point.datum.value === null
            ? "Missing or invalid numeric value"
            : withUnit(point.datum.value, spec.unit),
      })),
    }),
  }
  if (spec.type === "pie") {
    const slices = pie(valid, { value: "value" })
    return defineChart({
      marks: [
        polar({
          inset: 8,
          marks: [
            radialArc(slices, {
              key: "id",
              color: "id",
              innerRadius: ({ radius }) => radius * 0.5,
            }),
          ],
          scales: { angle: null, radius: null },
        }),
      ],
      scales: { x: null, y: null },
      color: {
        domain: valid.map((row) => row.id),
        range: valid.map((row) => sliceColor(row.index)),
      },
      tooltip: tooltipSpec,
    })
  }
  const line = lineY(data, { x: "index", y: "value", stroke: "var(--primary)" })
  const dots = dot(valid, {
    x: "index",
    y: "value",
    key: "id",
    fill: "var(--primary)",
  })
  // A line chart keeps one mark list shape; its area mark has no data.
  const area = areaY(spec.type === "area" ? data : [], {
    x: "index",
    y: "value",
    fill: "var(--primary)",
    fillOpacity: 0.25,
  })
  return defineChart({
    marks:
      spec.type === "bar"
        ? [
            barY(valid, {
              x: "index",
              y: "value",
              key: "id",
              fill: "var(--primary)",
            }),
          ]
        : [area, line, dots],
    scales: {
      x: {
        scale: () =>
          scaleBand<number>()
            .domain(data.map((row) => row.index))
            .padding(0.2),
        axis: {
          label: labelLabel,
          ticks: {
            format: (value: number) =>
              data.find((row) => row.index === value)?.label ?? "",
          },
        },
      },
      y: {
        scale: scaleLinear,
        zero: true,
        nice: true,
        grid: true,
        axis: { label: `${valueLabel} ${spec.unit}` },
      },
    },
    tooltip: tooltipSpec,
  })
}

function ScatterChart({
  title,
  spec,
  rows,
  fields,
}: {
  title: string
  spec: ScatterSpec
  rows: Row[]
  fields: Field[]
}) {
  const data = useMemo(() => scatterRows(rows, spec), [rows, spec])
  const labelLabel = fieldLabel(fields, spec.labelField)
  const xLabel = fieldLabel(fields, spec.xField)
  const yLabel = fieldLabel(fields, spec.valueField)
  const definition = useMemo(
    () => scatterDefinition(spec, data, labelLabel, xLabel, yLabel),
    [spec, data, labelLabel, xLabel, yLabel]
  )
  const missing = data.filter(
    (row) => row.x === null || row.value === null
  ).length
  return (
    <div className="flex flex-col gap-3">
      {missing > 0 && (
        <p role="status">
          {missing} points have a missing or invalid coordinate and are not
          plotted.
        </p>
      )}
      {data.length === 0 ? (
        <p>No matching records.</p>
      ) : data.length === missing ? (
        <p>No numeric points to chart.</p>
      ) : (
        <Chart
          definition={definition}
          height={300}
          ariaLabel={`${title}: scatter chart of ${yLabel} against ${xLabel}`}
          ariaDescription={keyboardHelp}
        />
      )}
      <details>
        <summary>View data table</summary>
        <table className="w-full text-left">
          <caption>{title} · source values</caption>
          <thead>
            <tr>
              <th scope="col">{labelLabel}</th>
              <th scope="col">
                {xLabel} {spec.xUnit}
              </th>
              <th scope="col">
                {yLabel} {spec.unit}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                <td>
                  {row.x === null
                    ? "Missing or invalid numeric value"
                    : withUnit(row.x, spec.xUnit)}
                </td>
                <td>
                  {row.value === null
                    ? "Missing or invalid numeric value"
                    : withUnit(row.value, spec.unit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}

/** Translate a scatter ChartSpec into a TanStack Charts definition. */
function scatterDefinition(
  spec: ScatterSpec,
  data: ScatterPoint[],
  labelLabel: string,
  xLabel: string,
  yLabel: string
) {
  const valid = data.flatMap((row) =>
    row.x === null || row.value === null
      ? []
      : [{ ...row, x: row.x, value: row.value }]
  )
  return defineChart({
    marks: [
      dot(valid, { x: "x", y: "value", key: "id", fill: "var(--primary)" }),
    ],
    scales: {
      x: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { label: `${xLabel} ${spec.xUnit}` },
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
        axis: { label: `${yLabel} ${spec.unit}` },
      },
    },
    tooltip: {
      use: tooltip,
      sticky: true,
      content: (points) => ({
        title: points[0]?.datum.label ?? labelLabel,
        rows: points.flatMap((point) => [
          { label: xLabel, value: withUnit(point.datum.x, spec.xUnit) },
          { label: yLabel, value: withUnit(point.datum.value, spec.unit) },
        ]),
      }),
    },
  })
}
