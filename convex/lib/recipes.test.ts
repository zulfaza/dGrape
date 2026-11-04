import { describe, expect, it } from "vitest"
import {
  checkBudget,
  transform,
  validateRecipe,
  type Recipe,
  type RecipeRow,
  type RecipeStep,
} from "./recipeDomain"
import { latestDue, nextOccurrence, occurrenceId } from "./recipeSchedule"

const limits: Recipe["limits"] = {
  rows: 100,
  bytes: 10_000,
  durationMs: 1000,
  attempts: 3,
}
describe("trusted recipe transforms", () => {
  it("maps, filters, joins and aggregates with stable ordering and typed group keys", () => {
    const mapped = transform(
      [
        { id: 1, amount: 4 },
        { id: 2, amount: 8 },
      ],
      { kind: "map", fields: { key: "id", amount: "amount" } },
      limits
    )
    const joined = transform(
      mapped,
      {
        kind: "join",
        field: "key",
        rightField: "id",
        prefix: "tag",
        rows: [
          { id: 1, name: "a" },
          { id: 2, name: "b" },
        ],
      },
      limits
    )
    expect(
      transform(
        joined,
        { kind: "filter", field: "tag_name", equals: "b" },
        limits
      )
    ).toEqual([{ key: 2, amount: 8, tag_id: 2, tag_name: "b" }])
    expect(
      transform(
        [
          { group: 1, amount: 4 },
          { group: "1", amount: 8 },
          { group: 1, amount: 2 },
        ],
        {
          kind: "aggregate",
          groupBy: "group",
          operation: "sum",
          field: "amount",
          output: "total",
        },
        limits
      )
    ).toEqual([
      { group: 1, total: 6 },
      { group: "1", total: 8 },
    ])
  })
  it("filters by value set and inclusive typed range", () => {
    const rows: RecipeRow[] = [
      { n: 1 },
      { n: 5 },
      { n: "5" },
      { n: 9 },
      { d: "x" },
    ]
    expect(
      transform(rows, { kind: "filter", field: "n", in: [5, 9] }, limits)
    ).toEqual([{ n: 5 }, { n: 9 }])
    expect(
      transform(
        rows,
        { kind: "filter", field: "n", range: { min: 2, max: 9 } },
        limits
      )
    ).toEqual([{ n: 5 }, { n: 9 }])
    expect(
      transform(
        [{ day: "2026-01-01" }, { day: "2026-02-01" }],
        { kind: "filter", field: "day", range: { max: "2026-01-31" } },
        limits
      )
    ).toEqual([{ day: "2026-01-01" }])
    const output: RecipeStep = { kind: "artifact", name: "a", format: "json" }
    const invalid: RecipeStep[] = [
      { kind: "filter", field: "n", in: [] },
      { kind: "filter", field: "n", range: {} },
      { kind: "filter", field: "n", range: { min: 1, max: "2" } },
      { kind: "filter", field: "n", range: { min: 3, max: 2 } },
    ]
    for (const filter of invalid)
      expect(() => validateRecipe({ limits, steps: [filter, output] })).toThrow(
        /filter values|range/i
      )
  })
  it("aggregates min, max and average per group", () => {
    const rows = [
      { g: "a", v: 4 },
      { g: "b", v: 1 },
      { g: "a", v: 2 },
      { g: "a", v: 9 },
    ]
    const run = (operation: "min" | "max" | "average") =>
      transform(
        rows,
        { kind: "aggregate", groupBy: "g", operation, field: "v", output: "o" },
        limits
      )
    expect(run("min")).toEqual([
      { g: "a", o: 2 },
      { g: "b", o: 1 },
    ])
    expect(run("max")).toEqual([
      { g: "a", o: 9 },
      { g: "b", o: 1 },
    ])
    expect(run("average")).toEqual([
      { g: "a", o: 5 },
      { g: "b", o: 1 },
    ])
    expect(() =>
      validateRecipe({
        limits,
        steps: [
          { kind: "aggregate", groupBy: "g", operation: "max", output: "o" },
          { kind: "artifact", name: "a", format: "json" },
        ],
      })
    ).toThrow("needs a field")
  })
  it("rejects unbounded recipes and missing outputs", () => {
    expect(() => validateRecipe({ limits, steps: [] })).toThrow(
      /steps|UTC cron/
    )
    expect(() =>
      validateRecipe({ limits, steps: [{ kind: "map", fields: { x: "y" } }] })
    ).toThrow("output")
    expect(() =>
      validateRecipe({
        limits,
        steps: [
          { kind: "artifact", name: "data.json", format: "json" },
          { kind: "filter", field: "x", equals: 1 },
        ],
      })
    ).toThrow("last")
    expect(() => checkBudget([{ x: "long" }], { ...limits, bytes: 2 })).toThrow(
      "byte"
    )
    expect(() =>
      transform(
        [{ x: 1 }, { x: 1 }],
        {
          kind: "join",
          field: "x",
          rightField: "x",
          prefix: "r",
          rows: [{ x: 1 }, { x: 1 }],
        },
        { ...limits, rows: 2 }
      )
    ).toThrow("row")
  })
  it("rejects field collisions and non-finite aggregates", () => {
    expect(() =>
      transform(
        [{ x: 1, r_x: 2 }],
        {
          kind: "join",
          field: "x",
          rightField: "x",
          prefix: "r",
          rows: [{ x: 1 }],
        },
        limits
      )
    ).toThrow("collision")
    expect(() =>
      transform(
        [{ group: "g", amount: "bad" }],
        {
          kind: "aggregate",
          groupBy: "group",
          operation: "sum",
          field: "amount",
          output: "total",
        },
        limits
      )
    ).toThrow("finite")
  })
})
describe("UTC occurrence planning", () => {
  it("coalesces late delivery to the latest occurrence with a stable identity", () => {
    const timing = {
      kind: "cron",
      expression: "*/15 * * * *",
    } satisfies Parameters<typeof latestDue>[0]
    const now = Date.UTC(2026, 10, 3, 8, 47)
    const due = latestDue(timing, Date.UTC(2026, 10, 2), now)
    expect(due).toBe(Date.UTC(2026, 10, 3, 8, 45))
    expect(nextOccurrence(timing, now)).toBe(Date.UTC(2026, 10, 3, 9))
    expect(occurrenceId("abc", 123)).toBe(occurrenceId("abc", 123))
  })
  it("uses cron OR semantics for restricted day and weekday, and handles leap days", () => {
    expect(
      nextOccurrence(
        { kind: "cron", expression: "0 0 1 * 1" },
        Date.UTC(2026, 10, 1)
      )
    ).toBe(Date.UTC(2026, 10, 2))
    expect(
      nextOccurrence(
        { kind: "cron", expression: "0 0 29 2 *" },
        Date.UTC(2026, 0, 1)
      )
    ).toBe(Date.UTC(2028, 1, 29))
  })
  it("ends one-offs and rejects invalid cron", () => {
    expect(nextOccurrence({ kind: "once", at: 100 }, 100)).toBeNull()
    expect(latestDue({ kind: "once", at: 100 }, 100, 99)).toBeNull()
    expect(latestDue({ kind: "once", at: 100 }, 100, 100)).toBe(100)
    expect(() =>
      nextOccurrence({ kind: "cron", expression: "60 * * * *" }, 0)
    ).toThrow(/steps|UTC cron/)
    expect(() =>
      nextOccurrence({ kind: "cron", expression: "*/0 * * * *" }, 0)
    ).toThrow(/steps|UTC cron/)
  })
})

it("reads only own fields and rejects non-finite group keys", () => {
  expect(
    transform([{}], { kind: "map", fields: { x: "constructor" } }, limits)
  ).toEqual([{}])
  expect(
    transform(
      [{}],
      {
        kind: "join",
        field: "constructor",
        rightField: "constructor",
        prefix: "r",
        rows: [{}],
      },
      limits
    )
  ).toEqual([])
  expect(() =>
    transform(
      [{}],
      {
        kind: "aggregate",
        groupBy: "constructor",
        operation: "count",
        output: "total",
      },
      limits
    )
  ).toThrow("Missing group")
  expect(() =>
    transform(
      [{ g: NaN }],
      { kind: "aggregate", groupBy: "g", operation: "count", output: "total" },
      limits
    )
  ).toThrow("finite")
  expect(() =>
    validateRecipe({
      limits,
      steps: [
        {
          kind: "join",
          field: "g",
          rightField: "g",
          prefix: "r",
          rows: [{ g: Infinity }],
        },
        { kind: "artifact", name: "x", format: "json" },
      ],
    })
  ).toThrow("finite")
})
it("applies AND semantics to wildcard-step day fields", () => {
  expect(
    nextOccurrence(
      { kind: "cron", expression: "0 0 */2 * 1" },
      Date.UTC(2026, 10, 2)
    )
  ).toBe(Date.UTC(2026, 10, 9))
})
