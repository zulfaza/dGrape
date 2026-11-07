import { v, type Infer, type VId, type VString } from "convex/values"
import type { Id } from "../_generated/dataModel"

type QueryIdValidator =
  | VId<Id<"queryDefinitions">, "required">
  | VString<string, "required">
type ArtifactIdValidator =
  | VId<Id<"artifacts">, "required">
  | VString<string, "required">

/**
 * App-owned ChartSpec. Each variant names only the fields its geometry reads.
 * - Category charts plot one numeric `valueField` per `labelField` category,
 *   in saved query order. Pie values must be zero or more.
 * - Scatter plots numeric `xField` against numeric `valueField`; `labelField`
 *   names each point in tooltips and the table view.
 */
export const chartSpecValidator = v.union(
  v.object({
    type: v.union(
      v.literal("bar"),
      v.literal("line"),
      v.literal("area"),
      v.literal("pie")
    ),
    labelField: v.string(),
    valueField: v.string(),
    unit: v.string(),
  }),
  v.object({
    type: v.literal("scatter"),
    labelField: v.string(),
    xField: v.string(),
    xUnit: v.string(),
    valueField: v.string(),
    unit: v.string(),
  })
)
export type ChartSpec = Infer<typeof chartSpecValidator>
export type ChartType = ChartSpec["type"]
export const chartTypes = [
  "bar",
  "line",
  "area",
  "pie",
  "scatter",
] as const satisfies readonly ChartType[]

/** Columns in the dashboard grid. */
export const GRID_COLUMNS = 12
/** The tallest panel, in grid rows. */
export const MAX_PANEL_HEIGHT = 40

/**
 * Where a panel sits in the 12-column dashboard grid, in whole grid cells.
 * `x` and `y` are the top-left cell; `w` and `h` are the width and height.
 * validatePage checks the bounds and that no two panels overlap.
 */
export const panelLayoutValidator = v.object({
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
})
export type PanelLayout = Infer<typeof panelLayoutValidator>

/**
 * Builds the page protocol with typed IDs (stored pages) or plain strings
 * (agent input, before resolvePageIds in convex/agentPages.ts checks them).
 */
function pageDefinition<
  Q extends QueryIdValidator,
  A extends ArtifactIdValidator,
>(queryId: Q, artifactId: A) {
  /** Blocks without a layout flow into the grid in order (old pages). */
  const panel = { layout: v.optional(panelLayoutValidator) }
  const dataFields = {
    ...panel,
    title: v.string(),
    binding: v.object({ queryId, revision: v.number() }),
  }
  return v.object({
    title: v.string(),
    blocks: v.array(
      v.union(
        v.object({ kind: v.literal("markdown"), ...panel, text: v.string() }),
        v.object({
          kind: v.literal("table"),
          ...dataFields,
          fields: v.array(v.string()),
        }),
        v.object({
          kind: v.literal("metric"),
          ...dataFields,
          field: v.string(),
          unit: v.string(),
          operation: v.union(v.literal("sum"), v.literal("count")),
        }),
        v.object({
          kind: v.literal("chart"),
          ...dataFields,
          chart: chartSpecValidator,
        }),
        v.object({
          kind: v.literal("artifact"),
          ...panel,
          title: v.string(),
          artifactId,
        }),
        /** Static HTML snapshot artifact, shown in a sandboxed opaque-origin frame. */
        v.object({
          kind: v.literal("htmlReport"),
          ...panel,
          title: v.string(),
          artifactId,
        })
      )
    ),
  })
}

/** Application-owned protocol: no library options, functions, URLs, or HTML. */
export const pageDefinitionValidator = pageDefinition(
  v.id("queryDefinitions"),
  v.id("artifacts")
)
/** A page definition from an agent, with IDs not yet checked. */
export const agentPageDefinitionValidator = pageDefinition(
  v.string(),
  v.string()
)
export type AgentPageDefinition = Infer<typeof agentPageDefinitionValidator>
export type PageBlock = PageDefinition["blocks"][number]
export type PageDefinition = Infer<typeof pageDefinitionValidator>

export function validatePage(definition: PageDefinition) {
  if (!definition.title.trim() || definition.title.length > 100)
    throw new Error("Page title must be 1 to 100 characters")
  if (definition.blocks.length > 20)
    throw new Error("A page can contain at most 20 blocks")
  if (new TextEncoder().encode(JSON.stringify(definition)).length > 100_000)
    throw new Error("Page definition exceeds 100 KB")
  const placed: { at: string; layout: PanelLayout }[] = []
  for (const [index, block] of definition.blocks.entries()) {
    const at = `Block ${index + 1} (${block.kind})`
    if (block.layout) {
      validateLayout(block.layout, at)
      const layout = block.layout
      const other = placed.find((item) => overlaps(item.layout, layout))
      if (other) throw new Error(`${at}: layout overlaps ${other.at}`)
      placed.push({ at, layout })
    }
    if (block.kind === "markdown") continue
    if (!block.title.trim() || block.title.length > 100)
      throw new Error(`${at}: block title must be 1 to 100 characters`)
    if (block.kind === "artifact" || block.kind === "htmlReport") continue
    if (block.kind === "chart") validateChart(block.chart, at)
    if (
      !Number.isSafeInteger(block.binding.revision) ||
      block.binding.revision < 1
    )
      throw new Error(`${at}: query revision must be a positive integer`)
    if (
      block.kind === "table" &&
      (block.fields.length < 1 ||
        block.fields.length > 20 ||
        new Set(block.fields).size !== block.fields.length)
    )
      throw new Error(`${at}: tables require 1 to 20 unique fields`)
  }
}

function validateLayout({ x, y, w, h }: PanelLayout, at: string) {
  if (![x, y, w, h].every(Number.isSafeInteger))
    throw new Error(`${at}: layout values must be integers`)
  if (x < 0 || w < 1 || w > GRID_COLUMNS || x + w > GRID_COLUMNS)
    throw new Error(
      `${at}: layout needs 0 <= x, 1 <= w <= ${GRID_COLUMNS} and x + w <= ${GRID_COLUMNS}`
    )
  if (y < 0 || h < 1 || h > MAX_PANEL_HEIGHT)
    throw new Error(
      `${at}: layout needs 0 <= y and 1 <= h <= ${MAX_PANEL_HEIGHT}`
    )
}

/** True when two grid rectangles share at least one cell. */
export function overlaps(a: PanelLayout, b: PanelLayout) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  )
}

function validateChart(chart: ChartSpec, at: string) {
  if (
    !chart.labelField.trim() ||
    !chart.valueField.trim() ||
    chart.unit.length > 100 ||
    (chart.type === "scatter" &&
      (!chart.xField.trim() || chart.xUnit.length > 100))
  )
    throw new Error(
      `${at}: charts require label and numeric fields and a unit up to 100 characters`
    )
}

/** Numeric result fields that a chart reads. */
export function chartNumericFields(chart: ChartSpec) {
  return chart.type === "scatter"
    ? [chart.xField, chart.valueField]
    : [chart.valueField]
}

export const pageFields = {
  workspaceId: v.id("workspaces"),
  title: v.string(),
  revision: v.number(),
  publishedRevision: v.optional(v.number()),
}
export const pageVersionFields = {
  pageId: v.id("pages"),
  revision: v.number(),
  definition: pageDefinitionValidator,
  createdBy: v.string(),
  createdAt: v.number(),
}
export const pageValidator = v.object({
  ...pageFields,
  _id: v.id("pages"),
  _creationTime: v.number(),
})
export const pageVersionValidator = v.object({
  ...pageVersionFields,
  _id: v.id("pageVersions"),
  _creationTime: v.number(),
})
