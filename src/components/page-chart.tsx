import { useMemo } from "react"
import { Chart } from "@tanstack/charts/react"
import { defineChart } from "@tanstack/charts/scene"
import { barY } from "@tanstack/charts/bar"
import { lineY } from "@tanstack/charts/line"
import { dot } from "@tanstack/charts/dot"
import { scaleBand } from "@tanstack/charts/scales/band"
import { scaleLinear } from "@tanstack/charts/scales/linear"
import { tooltip } from "@tanstack/charts/tooltip"
import type { PageBlock } from "../../convex/lib/pageDomain"
import type { RecordValue } from "../../convex/lib/collectionDomain"

type ChartBlock = Extract<PageBlock, { kind: "chart" }>
type Row = { _id: string; values: Record<string, RecordValue> }

/** Preserve source order and identity; never coerce missing values to zero. */
export function chartRows(rows: Row[], spec: ChartBlock["chart"]) {
  return rows.map((row, index) => {
    const value = row.values[spec.valueField]
    const label = row.values[spec.labelField]
    return {
      id: row._id,
      index,
      label: label === undefined ? "Missing label" : String(label),
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Numeric chart geometry requires finite stored numbers.
      value: typeof value === "number" && Number.isFinite(value) ? value : null,
    }
  })
}

export function PageChart({
  block,
  rows,
  fields,
}: {
  block: ChartBlock
  rows: Row[]
  fields: { id: string; label: string }[]
}) {
  const data = useMemo(() => chartRows(rows, block.chart), [rows, block.chart])
  const valueLabel =
    fields.find((f) => f.id === block.chart.valueField)?.label ??
    block.chart.valueField
  const labelLabel =
    fields.find((f) => f.id === block.chart.labelField)?.label ??
    block.chart.labelField
  const definition = useMemo(() => {
    const valid = data.flatMap((row) =>
      row.value === null ? [] : [{ ...row, value: row.value }]
    )
    return defineChart({
      marks:
        block.chart.type === "bar"
          ? [
              barY(valid, {
                x: "index",
                y: "value",
                key: "id",
                fill: "var(--primary)",
              }),
            ]
          : [
              lineY(data, { x: "index", y: "value", stroke: "var(--primary)" }),
              dot(valid, {
                x: "index",
                y: "value",
                key: "id",
                fill: "var(--primary)",
              }),
            ],
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
          axis: { label: `${valueLabel} ${block.chart.unit}` },
        },
      },
      tooltip: {
        use: tooltip,
        sticky: true,
        content: (points) => ({
          title: points[0]?.datum.label ?? "",
          rows: points.map((point) => ({
            label: valueLabel,
            value: `${point.yValue} ${block.chart.unit}`,
          })),
        }),
      },
    })
  }, [data, block.chart.type, block.chart.unit, labelLabel, valueLabel])
  const missing = data.filter((row) => row.value === null).length
  return (
    <div className="flex flex-col gap-3">
      {missing > 0 && (
        <p role="status">
          {missing} missing or invalid numeric values; gaps are not zero.
        </p>
      )}
      {data.length === 0 ? (
        <p>No matching records.</p>
      ) : data.length === missing ? (
        <p>No numeric values to chart.</p>
      ) : (
        <Chart
          definition={definition}
          height={300}
          ariaLabel={block.title}
          ariaDescription="Use arrow keys to inspect points, Enter to pin details, Escape to dismiss. Values follow saved query order."
        />
      )}
      <details>
        <summary>View data table</summary>
        <table className="w-full text-left">
          <caption>{block.title} · source values</caption>
          <thead>
            <tr>
              <th scope="col">{labelLabel}</th>
              <th scope="col">
                {valueLabel} {block.chart.unit}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <th scope="row">{row.label}</th>
                <td>
                  {row.value === null
                    ? "Missing or invalid numeric value"
                    : `${row.value} ${block.chart.unit}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  )
}
