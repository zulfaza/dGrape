import { v, type Infer, type VId, type VString } from "convex/values"
import type { Id } from "../_generated/dataModel"

type QueryIdValidator =
  | VId<Id<"queryDefinitions">, "required">
  | VString<string, "required">
type ArtifactIdValidator =
  | VId<Id<"artifacts">, "required">
  | VString<string, "required">

/**
 * Builds the page protocol with typed IDs (stored pages) or plain strings
 * (agent input, before resolvePageIds in convex/agentPages.ts checks them).
 */
function pageDefinition<
  Q extends QueryIdValidator,
  A extends ArtifactIdValidator,
>(queryId: Q, artifactId: A) {
  const dataFields = {
    title: v.string(),
    binding: v.object({ queryId, revision: v.number() }),
  }
  return v.object({
    title: v.string(),
    blocks: v.array(
      v.union(
        v.object({ kind: v.literal("markdown"), text: v.string() }),
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
          chart: v.object({
            type: v.union(v.literal("bar"), v.literal("line")),
            labelField: v.string(),
            valueField: v.string(),
            unit: v.string(),
          }),
        }),
        v.object({
          kind: v.literal("artifact"),
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
  for (const [index, block] of definition.blocks.entries()) {
    const at = `Block ${index + 1} (${block.kind})`
    if (block.kind === "markdown") continue
    if (!block.title.trim() || block.title.length > 100)
      throw new Error(`${at}: block title must be 1 to 100 characters`)
    if (block.kind === "artifact") continue
    if (
      block.kind === "chart" &&
      (!block.chart.labelField.trim() ||
        !block.chart.valueField.trim() ||
        block.chart.unit.length > 100)
    )
      throw new Error(
        `${at}: charts require label and numeric fields and a unit up to 100 characters`
      )
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
