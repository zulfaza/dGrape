import { v, type Infer } from "convex/values"

const queryBinding = v.object({
  queryId: v.id("queryDefinitions"),
  revision: v.number(),
})
const dataFields = {
  title: v.string(),
  binding: queryBinding,
}
/** Application-owned protocol: no library options, functions, URLs, or HTML. */
export const pageBlockValidator = v.union(
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
    artifactId: v.id("artifacts"),
  })
)
export const pageDefinitionValidator = v.object({
  title: v.string(),
  blocks: v.array(pageBlockValidator),
})
export type PageBlock = Infer<typeof pageBlockValidator>
export type PageDefinition = Infer<typeof pageDefinitionValidator>

export function validatePage(definition: PageDefinition) {
  if (!definition.title.trim() || definition.title.length > 100)
    throw new Error("Page title must be 1 to 100 characters")
  if (definition.blocks.length > 20)
    throw new Error("A page can contain at most 20 blocks")
  if (new TextEncoder().encode(JSON.stringify(definition)).length > 100_000)
    throw new Error("Page definition exceeds 100 KB")
  for (const block of definition.blocks) {
    if (block.kind === "markdown") continue
    if (!block.title.trim() || block.title.length > 100)
      throw new Error("Block title must be 1 to 100 characters")
    if (block.kind === "artifact") continue
    if (
      !Number.isSafeInteger(block.binding.revision) ||
      block.binding.revision < 1
    )
      throw new Error("Query revision must be a positive integer")
    if (
      block.kind === "table" &&
      (block.fields.length < 1 ||
        block.fields.length > 20 ||
        new Set(block.fields).size !== block.fields.length)
    )
      throw new Error("Tables require 1 to 20 unique fields")
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
