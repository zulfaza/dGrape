import {
  collectionRecordValidator,
  collectionDefinitionValidator,
  collectionFieldValidator,
} from "./lib/collectionDomain"
import {
  paginationOptsValidator,
  paginationResultValidator,
  type PaginationOptions,
} from "convex/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { requireMembership } from "./lib/auth"
import { runSavedQuery } from "./lib/savedQueries"
import {
  pageDefinitionValidator,
  pageValidator,
  pageVersionValidator,
  validatePage,
  type PageBlock,
  type PageDefinition,
} from "./lib/pageDomain"

async function getVersion(
  ctx: QueryCtx,
  pageId: Id<"pages">,
  revision: number
) {
  return ctx.db
    .query("pageVersions")
    .withIndex("by_pageId_and_revision", (q) =>
      q.eq("pageId", pageId).eq("revision", revision)
    )
    .unique()
}

/** Check every reference on save and publish. Old versions remain readable. */
async function bindingProblem(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  block: PageBlock
): Promise<string | null> {
  if (block.kind === "markdown") return null
  if (block.kind === "artifact") {
    const artifact = await ctx.db.get(block.artifactId)
    return artifact?.workspaceId === workspaceId
      ? null
      : "Artifact is unavailable in this workspace"
  }
  const saved = await ctx.db.get(block.binding.queryId)
  if (!saved || saved.workspaceId !== workspaceId)
    return "Query is unavailable in this workspace"
  const version = await ctx.db
    .query("queryDefinitionVersions")
    .withIndex("by_queryId_and_revision", (q) =>
      q.eq("queryId", saved._id).eq("revision", block.binding.revision)
    )
    .unique()
  if (!version)
    return `Query revision ${block.binding.revision} is unavailable; the latest is ${saved.revision}`
  const collection = await ctx.db.get(saved.collectionId)
  if (!collection || collection.workspaceId !== workspaceId)
    return "Source collection is unavailable"
  if (collection.definition.version !== version.schemaVersion)
    return "Query schema is stale; save and bind a new query revision"
  const fields = version.resultSchema.fields
  const has = (id: string) => fields.some((f) => f.id === id)
  const numeric = (id: string) =>
    fields.some((f) => f.id === id && f.type === "number")
  const available = `Result fields: ${fields.map((f) => `${f.id} (${f.type})`).join(", ") || "none"}`
  if (block.kind === "table") {
    const missing = block.fields.filter((id) => !has(id))
    return missing.length === 0
      ? null
      : `Table field ${missing.map((id) => `"${id}"`).join(", ")} is missing from the query result. ${available}`
  }
  if (block.kind === "metric")
    return block.operation === "count" || numeric(block.field)
      ? null
      : `Metric requires a numeric result field; "${block.field}" is not one. ${available}`
  return has(block.chart.labelField) && numeric(block.chart.valueField)
    ? null
    : `Chart requires a label and numeric result field; got label "${block.chart.labelField}" and value "${block.chart.valueField}". ${available}`
}

async function validateBindings(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  definition: PageDefinition
) {
  for (const [index, block] of definition.blocks.entries()) {
    const problem = await bindingProblem(ctx, workspaceId, block)
    if (problem)
      throw new Error(`Block ${index + 1} (${block.kind}): ${problem}`)
  }
}

/**
 * Saves a new draft revision of a page in `workspaceId`. The caller has
 * already proved access to the workspace; `createdBy` is its user ID.
 */
export async function savePageDraft(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  createdBy: string,
  args: {
    pageId?: Id<"pages">
    expectedRevision?: number
    definition: PageDefinition
  }
): Promise<{ pageId: Id<"pages">; revision: number }> {
  validatePage(args.definition)
  await validateBindings(ctx, workspaceId, args.definition)
  let pageId: Id<"pages">
  let revision: number
  if (args.pageId) {
    const page = await ctx.db.get(args.pageId)
    if (!page || page.workspaceId !== workspaceId)
      throw new Error("Page access denied")
    if (page.revision !== args.expectedRevision)
      throw new Error("Page revision conflict")
    pageId = page._id
    revision = page.revision + 1
    await ctx.db.patch(pageId, { revision, title: args.definition.title })
  } else {
    if (args.expectedRevision !== undefined)
      throw new Error("New pages have no expected revision")
    revision = 1
    pageId = await ctx.db.insert("pages", {
      workspaceId,
      title: args.definition.title,
      revision,
    })
  }
  await ctx.db.insert("pageVersions", {
    pageId,
    revision,
    definition: args.definition,
    createdBy,
    createdAt: Date.now(),
  })
  return { pageId, revision }
}

/** Publishes (or rolls back to) a stored revision of a page in `workspaceId`. */
export async function publishPage(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  args: {
    pageId: Id<"pages">
    revision: number
    expectedRevision: number
    expectedPublishedRevision: number | null
  }
): Promise<null> {
  const page = await ctx.db.get(args.pageId)
  if (!page || page.workspaceId !== workspaceId)
    throw new Error("Page access denied")
  if (
    page.revision !== args.expectedRevision ||
    (page.publishedRevision ?? null) !== args.expectedPublishedRevision
  )
    throw new Error("Page revision conflict")
  const version = await getVersion(ctx, page._id, args.revision)
  if (!version) throw new Error("Page version not found")
  await validateBindings(ctx, page.workspaceId, version.definition)
  await ctx.db.patch(page._id, { publishedRevision: version.revision })
  return null
}

/**
 * Reads a page of `workspaceId` and one version: `revision`, or the published
 * one. `bindings` has one problem (or null) for each block of that version.
 */
export async function getPage(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  pageId: Id<"pages">,
  revision: number | undefined
) {
  const page = await ctx.db.get(pageId)
  if (!page || page.workspaceId !== workspaceId)
    throw new Error("Page access denied")
  const selected = revision ?? page.publishedRevision
  const version =
    selected === undefined ? null : await getVersion(ctx, page._id, selected)
  if (revision !== undefined && !version)
    throw new Error("Page version not found")
  const bindings = version
    ? await Promise.all(
        version.definition.blocks.map((block) =>
          bindingProblem(ctx, page.workspaceId, block)
        )
      )
    : []
  return { page, version, bindings }
}

/** Lists the pages of `workspaceId`, newest first, at most 20 at a time. */
export async function listPages(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  paginationOpts: PaginationOptions
) {
  if (
    !Number.isSafeInteger(paginationOpts.numItems) ||
    paginationOpts.numItems < 1 ||
    paginationOpts.numItems > 20
  )
    throw new Error("Page size must be 1 to 20")
  const result = await ctx.db
    .query("pages")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .order("desc")
    .paginate(paginationOpts)
  return {
    page: result.page,
    isDone: result.isDone,
    continueCursor: result.continueCursor,
  }
}

export const save = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    pageId: v.optional(v.id("pages")),
    expectedRevision: v.optional(v.number()),
    definition: pageDefinitionValidator,
  },
  returns: v.object({ pageId: v.id("pages"), revision: v.number() }),
  handler: async (ctx, { workspaceId, ...args }) => {
    const member = await requireMembership(ctx, workspaceId)
    return savePageDraft(ctx, workspaceId, member.userId, args)
  },
})

/** Publishing and rollback both select an existing immutable definition. */
export const publish = mutation({
  args: {
    pageId: v.id("pages"),
    revision: v.number(),
    expectedRevision: v.number(),
    expectedPublishedRevision: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId)
    if (!page) throw new Error("Page access denied")
    await requireMembership(ctx, page.workspaceId)
    return publishPage(ctx, page.workspaceId, args)
  },
})

export const get = query({
  args: { pageId: v.id("pages"), revision: v.optional(v.number()) },
  returns: v.object({
    page: pageValidator,
    version: v.union(pageVersionValidator, v.null()),
    bindings: v.array(v.union(v.string(), v.null())),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId)
    if (!page) throw new Error("Page access denied")
    await requireMembership(ctx, page.workspaceId)
    return getPage(ctx, page.workspaceId, page._id, args.revision)
  },
})

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(pageValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId)
    return listPages(ctx, args.workspaceId, args.paginationOpts)
  },
})

export const history = query({
  args: { pageId: v.id("pages"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(pageVersionValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId)
    if (!page) throw new Error("Page access denied")
    await requireMembership(ctx, page.workspaceId)
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 20
    )
      throw new Error("Page size must be 1 to 20")
    const result = await ctx.db
      .query("pageVersions")
      .withIndex("by_pageId_and_revision", (q) => q.eq("pageId", page._id))
      .order("desc")
      .paginate(args.paginationOpts)
    return {
      page: result.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
  },
})

/** Only stored, authorized block bindings can execute. No client query input. */
const liveResultValidator = paginationResultValidator(
  collectionRecordValidator
).extend({
  queryId: v.id("queryDefinitions"),
  revision: v.number(),
  resultSchema: collectionDefinitionValidator,
  completeness: v.union(v.literal("complete"), v.literal("partial")),
  freshness: v.literal("live"),
  readAt: v.number(),
})
export const liveBlock = query({
  returns: v.union(
    v.object({ problem: v.string(), result: v.null() }),
    v.object({ problem: v.null(), result: liveResultValidator })
  ),
  args: { pageId: v.id("pages"), revision: v.number(), blockIndex: v.number() },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId)
    if (!page) throw new Error("Page access denied")
    await requireMembership(ctx, page.workspaceId)
    if (
      !Number.isSafeInteger(args.revision) ||
      args.revision < 1 ||
      !Number.isSafeInteger(args.blockIndex) ||
      args.blockIndex < 0 ||
      args.blockIndex >= 20
    )
      throw new Error("Invalid block address")
    const version = await getVersion(ctx, page._id, args.revision)
    const block = version?.definition.blocks[args.blockIndex]
    if (
      !block ||
      (block.kind !== "table" &&
        block.kind !== "metric" &&
        block.kind !== "chart")
    )
      return { problem: "Live block is unavailable", result: null }
    const problem = await bindingProblem(ctx, page.workspaceId, block)
    if (problem) return { problem, result: null }
    try {
      const result = await runSavedQuery(ctx, {
        queryId: block.binding.queryId,
        expectedRevision: block.binding.revision,
        paginationOpts: {
          cursor: null,
          numItems: 50,
          maximumRowsRead: 100,
          maximumBytesRead: 1_000_000,
        },
      })
      return { problem: null, result }
    } catch {
      return {
        problem:
          "Live query could not be read within its budget. Check the source and binding.",
        result: null,
      }
    }
  },
})

/** A bounded picker of current, schema-valid saved revisions. */
export const sources = query({
  returns: v.array(
    v.object({
      queryId: v.id("queryDefinitions"),
      revision: v.number(),
      name: v.string(),
      fields: v.array(collectionFieldValidator),
    })
  ),
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.workspaceId)
    const saved = await ctx.db
      .query("queryDefinitions")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .take(50)
    const sources = []
    for (const item of saved) {
      const version = await ctx.db
        .query("queryDefinitionVersions")
        .withIndex("by_queryId_and_revision", (q) =>
          q.eq("queryId", item._id).eq("revision", item.revision)
        )
        .unique()
      const collection = await ctx.db.get(item.collectionId)
      if (
        version &&
        collection?.workspaceId === args.workspaceId &&
        collection.definition.version === version.schemaVersion
      )
        sources.push({
          queryId: item._id,
          revision: item.revision,
          name: item.name,
          fields: version.resultSchema.fields,
        })
    }
    return sources
  },
})
