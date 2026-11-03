import { v, type Infer } from "convex/values"
import { recordValuesValidator, recordValueValidator } from "./collectionDomain"

export const recipeStepValidator = v.union(
  v.object({
    kind: v.literal("fetch"),
    connectionId: v.string(),
    route: v.string(),
    maxPages: v.number(),
  }),
  v.object({
    kind: v.literal("map"),
    fields: v.record(v.string(), v.string()),
  }),
  v.object({
    kind: v.literal("filter"),
    field: v.string(),
    equals: recordValueValidator,
  }),
  v.object({
    kind: v.literal("join"),
    field: v.string(),
    rightField: v.string(),
    prefix: v.string(),
    rows: v.array(recordValuesValidator),
  }),
  v.object({
    kind: v.literal("aggregate"),
    groupBy: v.string(),
    operation: v.union(v.literal("count"), v.literal("sum")),
    field: v.optional(v.string()),
    output: v.string(),
  }),
  v.object({
    kind: v.literal("upsert"),
    collectionId: v.string(),
    source: v.string(),
    identityField: v.string(),
  }),
  v.object({ kind: v.literal("snapshot"), collectionId: v.string() }),
  v.object({
    kind: v.literal("artifact"),
    name: v.string(),
    format: v.literal("json"),
  })
)
export const recipeValidator = v.object({
  steps: v.array(recipeStepValidator),
  limits: v.object({
    rows: v.number(),
    bytes: v.number(),
    durationMs: v.number(),
    attempts: v.number(),
  }),
})
export type Recipe = Infer<typeof recipeValidator>
export type RecipeStep = Infer<typeof recipeStepValidator>
export type RecipeRow = Infer<typeof recordValuesValidator>

function integer(value: number, min: number, max: number, label: string) {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new Error(`${label} must be an integer from ${min} to ${max}`)
}
function field(value: string) {
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(value))
    throw new Error("Invalid recipe field")
}
export const MAX_RECIPE_STEPS = 32
export const MAX_RECIPE_DURATION_MS = 900_000

/** Validate before storing an immutable version. There is no uploaded code. */
export function validateRecipe(recipe: Recipe): void {
  integer(recipe.steps.length, 1, MAX_RECIPE_STEPS, "steps")
  integer(recipe.limits.rows, 1, 1000, "rows")
  integer(recipe.limits.bytes, 1, 500_000, "bytes")
  integer(recipe.limits.durationMs, 1000, MAX_RECIPE_DURATION_MS, "durationMs")
  integer(recipe.limits.attempts, 1, 5, "attempts")
  let output = false
  let fetched = false
  for (const step of recipe.steps) {
    if (output) throw new Error("Output must be the last step")
    switch (step.kind) {
      case "fetch":
        if (fetched) throw new Error("A recipe can fetch one bounded source")
        fetched = true
        if (!step.connectionId || !step.route || step.route.length > 500)
          throw new Error("Invalid connector reference")
        integer(step.maxPages, 1, 20, "maxPages")
        break
      case "map":
        integer(Object.keys(step.fields).length, 1, 64, "mapped fields")
        for (const [target, source] of Object.entries(step.fields)) {
          field(target)
          field(source)
        }
        break
      case "filter":
        field(step.field)
        break
      case "join":
        field(step.field)
        field(step.rightField)
        field(step.prefix)
        integer(step.rows.length, 0, 100, "join rows")
        break
      case "aggregate":
        field(step.groupBy)
        field(step.output)
        if (step.output === step.groupBy)
          throw new Error("Aggregate output must differ from group field")
        if (step.operation === "sum" && !step.field)
          throw new Error("Sum needs a field")
        if (step.field) field(step.field)
        break
      case "upsert":
        if (!step.collectionId || !step.source || step.source.length > 100)
          throw new Error("Invalid upsert target")
        field(step.identityField)
        output = true
        break
      case "snapshot":
        if (!step.collectionId) throw new Error("Invalid snapshot target")
        output = true
        break
      case "artifact":
        if (!step.name.trim() || step.name.length > 200)
          throw new Error("Invalid artifact name")
        output = true
        break
    }
  }
  if (!output) throw new Error("A recipe must end with an output")
  checkBudget(
    recipe.steps.flatMap((step) => (step.kind === "join" ? step.rows : [])),
    recipe.limits
  )
}

function own(row: RecipeRow, key: string) {
  return Object.hasOwn(row, key) ? row[key] : undefined
}
export function checkBudget(rows: RecipeRow[], limits: Recipe["limits"]) {
  for (const row of rows)
    for (const value of Object.values(row)) {
      if (typeof value === "number" && !Number.isFinite(value))
        throw new Error("Recipe values must be finite")
    }
  if (rows.length > limits.rows) throw new Error("Recipe row limit exceeded")
  if (new TextEncoder().encode(JSON.stringify(rows)).byteLength > limits.bytes)
    throw new Error("Recipe byte limit exceeded")
}

/** Pure transforms preserve input order; joins and groups preserve first-seen order. */
export function transform(
  rows: RecipeRow[],
  step: RecipeStep,
  limits: Recipe["limits"]
): RecipeRow[] {
  checkBudget(rows, limits)
  let result: RecipeRow[]
  switch (step.kind) {
    case "map":
      result = rows.map((row) => {
        const mapped: RecipeRow = {}
        for (const [target, source] of Object.entries(step.fields)) {
          const value = own(row, source)
          if (value !== undefined) mapped[target] = value
        }
        return mapped
      })
      break
    case "filter":
      result = rows.filter((row) => own(row, step.field) === step.equals)
      break
    case "join": {
      result = []
      for (const left of rows)
        for (const right of step.rows) {
          if (
            own(left, step.field) === undefined ||
            own(left, step.field) !== own(right, step.rightField)
          )
            continue
          const joined = { ...left }
          for (const [key, value] of Object.entries(right)) {
            const target = `${step.prefix}_${key}`
            if (Object.hasOwn(joined, target))
              throw new Error("Join field collision")
            joined[target] = value
          }
          result.push(joined)
          checkBudget(result, limits)
        }
      break
    }
    case "aggregate": {
      const groups = new Map<string, RecipeRow>()
      for (const row of rows) {
        const key = own(row, step.groupBy)
        if (key === undefined) throw new Error("Missing group field")
        const encoded = JSON.stringify(key)
        const current = groups.get(encoded)
        const amount =
          step.operation === "count"
            ? 1
            : step.field
              ? own(row, step.field)
              : undefined
        if (typeof amount !== "number" || !Number.isFinite(amount))
          throw new Error("Sum needs finite numbers")
        const previous = (current ? own(current, step.output) : 0) ?? 0
        if (typeof previous !== "number") throw new Error("Invalid aggregate")
        const total = previous + amount
        if (!Number.isFinite(total)) throw new Error("Aggregate overflow")
        groups.set(encoded, { [step.groupBy]: key, [step.output]: total })
      }
      result = [...groups.values()]
      break
    }
    default:
      throw new Error("This step requires the trusted runtime")
  }
  checkBudget(result, limits)
  return result
}

type OutputStep = Extract<RecipeStep, { kind: "upsert" | "snapshot" }>
/** The source identity of an upsert row: a string or number of 1 to 200 characters. */
export function sourceKey(row: RecipeRow, identityField: string): string {
  const value = own(row, identityField)
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("Source identity must be a string or number")
  const key = String(value)
  if (!key.trim() || key.length > 200)
    throw new Error("Identity must be 1 to 200 characters")
  return key
}
/** Collection outputs permit at most 100 rows. Upsert rows need a source identity. */
export function checkOutput(step: OutputStep, rows: RecipeRow[]): void {
  if (rows.length > 100)
    throw new Error(
      `${step.kind === "upsert" ? "Upsert" : "Snapshot"} output permits at most 100 rows`
    )
  if (step.kind === "upsert")
    for (const row of rows) sourceKey(row, step.identityField)
}

export const recipeStepKindValidator = v.union(
  v.literal("fetch"),
  v.literal("map"),
  v.literal("filter"),
  v.literal("join"),
  v.literal("aggregate"),
  v.literal("upsert"),
  v.literal("snapshot"),
  v.literal("artifact")
)
export const recipePreviewValidator = v.object({
  steps: v.array(v.object({ kind: recipeStepKindValidator, rows: v.number() })),
  rows: v.array(recordValuesValidator),
})
export type RecipePreview = Infer<typeof recipePreviewValidator>
/**
 * Dry run of a valid recipe. `sample` replaces the rows that the fetch step
 * would read, so there is no network access. Output steps save nothing: the
 * result has the row count after each step and the rows the output gets.
 * Budgets and output rules are the same as in a run.
 */
export function previewRecipe(
  recipe: Recipe,
  sample: RecipeRow[]
): RecipePreview {
  validateRecipe(recipe)
  if (sample.length > 0 && !recipe.steps.some((s) => s.kind === "fetch"))
    throw new Error("Sample rows replace fetch output, but there is no fetch")
  let rows: RecipeRow[] = []
  const steps: RecipePreview["steps"] = []
  for (const [index, step] of recipe.steps.entries()) {
    try {
      switch (step.kind) {
        case "fetch":
          rows.push(...sample)
          break
        case "upsert":
        case "snapshot":
          checkOutput(step, rows)
          break
        case "artifact":
          break
        default:
          rows = transform(rows, step, recipe.limits)
      }
      checkBudget(rows, recipe.limits)
    } catch (error) {
      if (!(error instanceof Error)) throw error
      throw new Error(`Step ${index + 1} (${step.kind}): ${error.message}`)
    }
    steps.push({ kind: step.kind, rows: rows.length })
  }
  return { steps, rows }
}
