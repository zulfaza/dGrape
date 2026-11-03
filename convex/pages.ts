import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { mutation, query, type QueryCtx } from "./_generated/server"
import { requireMembership } from "./lib/auth"
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
  if (!version) return "Query revision is unavailable"
  const collection = await ctx.db.get(saved.collectionId)
  if (!collection || collection.workspaceId !== workspaceId)
    return "Source collection is unavailable"
  if (collection.definition.version !== version.schemaVersion)
    return "Query schema is stale; save and bind a new query revision"
  const fields = version.resultSchema.fields
  if (block.kind === "table")
    return block.fields.every((id) => fields.some((f) => f.id === id))
      ? null
      : "Table field is missing from the query result"
  if (block.kind === "metric")
    return block.operation === "count" ||
      fields.some((f) => f.id === block.field && f.type === "number")
      ? null
      : "Metric requires a numeric result field"
  return fields.some((f) => f.id === block.chart.labelField) &&
    fields.some((f) => f.id === block.chart.valueField && f.type === "number")
    ? null
    : "Chart requires a label and numeric result field"
}

async function validateBindings(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  definition: PageDefinition
) {
  for (const block of definition.blocks) {
    const problem = await bindingProblem(ctx, workspaceId, block)
    if (problem) throw new Error(problem)
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
  handler: async (ctx, args) => {
    const member = await requireMembership(ctx, args.workspaceId)
    validatePage(args.definition)
    await validateBindings(ctx, args.workspaceId, args.definition)
    let pageId: Id<"pages">
    let revision: number
    if (args.pageId) {
      const page = await ctx.db.get(args.pageId)
      if (!page || page.workspaceId !== args.workspaceId)
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
        workspaceId: args.workspaceId,
        title: args.definition.title,
        revision,
      })
    }
    await ctx.db.insert("pageVersions", {
      pageId,
      revision,
      definition: args.definition,
      createdBy: member.userId,
      createdAt: Date.now(),
    })
    return { pageId, revision }
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
    const revision = args.revision ?? page.publishedRevision
    const version =
      revision === undefined ? null : await getVersion(ctx, page._id, revision)
    if (args.revision !== undefined && !version)
      throw new Error("Page version not found")
    const bindings = version
      ? await Promise.all(
          version.definition.blocks.map((block) =>
            bindingProblem(ctx, page.workspaceId, block)
          )
        )
      : []
    return { page, version, bindings }
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
    if (
      !Number.isSafeInteger(args.paginationOpts.numItems) ||
      args.paginationOpts.numItems < 1 ||
      args.paginationOpts.numItems > 20
    )
      throw new Error("Page size must be 1 to 20")
    const result = await ctx.db
      .query("pages")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", args.workspaceId))
      .order("desc")
      .paginate(args.paginationOpts)
    return {
      page: result.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    }
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
