import { expect, test } from "vitest"
import { chartRows } from "../src/components/page-chart"

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
