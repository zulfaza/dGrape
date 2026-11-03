import { expect, test } from "vitest"
import { chartRows, scatterRows } from "../src/components/page-chart"

test("chart mapping preserves duplicate labels, source order, zero and numeric gaps", () => {
  const mapped = chartRows(
    [
      { _id: "a", values: { label: "Same", amount: 0 } },
      { _id: "b", values: { label: "Same", amount: -2 } },
      { _id: "c", values: { amount: "12" } },
      { _id: "d", values: { amount: Infinity } },
      { _id: "e", values: {} },
    ],
    { type: "line", labelField: "label", valueField: "amount", unit: "USD" }
  )
  expect(mapped.map((row) => row.value)).toEqual([0, -2, null, null, null])
  expect(mapped.map((row) => row.index)).toEqual([0, 1, 2, 3, 4])
  expect(mapped.map((row) => row.label)).toEqual([
    "Same",
    "Same",
    "Missing label",
    "Missing label",
    "Missing label",
  ])
})

test("pie mapping marks negative values invalid and keeps zero", () => {
  const mapped = chartRows(
    [
      { _id: "a", values: { label: "A", amount: 0 } },
      { _id: "b", values: { label: "B", amount: -2 } },
      { _id: "c", values: { label: "C", amount: 3 } },
    ],
    { type: "pie", labelField: "label", valueField: "amount", unit: "" }
  )
  expect(mapped.map((row) => row.value)).toEqual([0, null, 3])
})

test("scatter mapping requires both finite coordinates", () => {
  const mapped = scatterRows(
    [
      { _id: "a", values: { name: "A", x: 1, y: -2 } },
      { _id: "b", values: { x: "1", y: 2 } },
      { _id: "c", values: { name: "C", x: 3 } },
    ],
    {
      type: "scatter",
      labelField: "name",
      xField: "x",
      xUnit: "kg",
      valueField: "y",
      unit: "USD",
    }
  )
  expect(mapped.map((row) => [row.label, row.x, row.value])).toEqual([
    ["A", 1, -2],
    ["Missing label", null, 2],
    ["C", 3, null],
  ])
})
