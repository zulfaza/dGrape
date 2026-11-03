import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import {
  agentPageDefinitionValidator,
  pageDefinitionValidator,
  type AgentPageDefinition,
  type PageBlock,
  type PageDefinition,
} from "./lib/pageDomain"
import { getPage, listPages, publishPage, savePageDraft } from "./pages"

/**
 * Page operations for agent credentials. convex/http.ts calls these after it
 * decodes the request with convex/lib/agentPageTransport.ts. The credential
 * check and the operation share one transaction (withGrant).
 */

/** Turns the agent's ID strings into typed IDs, or names the bad block. */
function resolvePageIds(
  ctx: QueryCtx,
  definition: AgentPageDefinition
): PageDefinition {
  const blocks = definition.blocks.map((block, index): PageBlock => {
    const at = `Block ${index + 1} (${block.kind})`
    if (block.kind === "markdown") return block
    if (block.kind === "artifact") {
      const artifactId = ctx.db.normalizeId("artifacts", block.artifactId)
      if (!artifactId)
        throw new Error(
          `${at}: "${block.artifactId}" is not an artifact ID. Use artifacts_list to find one.`
        )
      return { ...block, artifactId }
    }
    const queryId = ctx.db.normalizeId(
      "queryDefinitions",
      block.binding.queryId
    )
    if (!queryId)
      throw new Error(
        `${at}: "${block.binding.queryId}" is not a saved query ID. Use queries_list to find one.`
      )
    return { ...block, binding: { ...block.binding, queryId } }
  })
  return { title: definition.title, blocks }
}

const pageSummary = v.object({
  pageId: v.id("pages"),
  title: v.string(),
  revision: v.number(),
  publishedRevision: v.union(v.number(), v.null()),
})

function summary(page: Doc<"pages">) {
  return {
    pageId: page._id,
    title: page.title,
    revision: page.revision,
    publishedRevision: page.publishedRevision ?? null,
  }
}

export const saveDraft = internalMutation({
  args: {
    digest: v.string(),
    pageId: v.optional(v.string()),
    expectedRevision: v.optional(v.number()),
    definition: agentPageDefinitionValidator,
  },
  returns: v.object({ pageId: v.id("pages"), revision: v.number() }),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), "write", async (grant) => {
      const pageId =
        args.pageId === undefined
          ? undefined
          : ctx.db.normalizeId("pages", args.pageId)
      if (args.pageId !== undefined && !pageId)
        throw new Error("Page access denied")
      return savePageDraft(ctx, grant.workspaceId, grant.owner, {
        pageId: pageId ?? undefined,
        expectedRevision: args.expectedRevision,
        definition: resolvePageIds(ctx, args.definition),
      })
    }),
})

export const publish = internalMutation({
  args: {
    digest: v.string(),
    pageId: v.string(),
    revision: v.number(),
    expectedRevision: v.number(),
    expectedPublishedRevision: v.union(v.number(), v.null()),
  },
  returns: pageSummary,
  handler: (ctx, { digest, pageId, ...args }) =>
    withGrant(ctx, digest, Date.now(), "write", async (grant) => {
      const id = ctx.db.normalizeId("pages", pageId)
      if (!id) throw new Error("Page access denied")
      await publishPage(ctx, grant.workspaceId, { ...args, pageId: id })
      const page = await ctx.db.get(id)
      if (!page) throw new Error("Page access denied")
      return summary(page)
    }),
})

export const get = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    pageId: v.string(),
    revision: v.optional(v.number()),
  },
  returns: v.object({
    page: pageSummary,
    version: v.union(
      v.object({
        revision: v.number(),
        definition: pageDefinitionValidator,
        createdAt: v.number(),
      }),
      v.null()
    ),
    bindings: v.array(v.union(v.string(), v.null())),
  }),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, "read", async (grant) => {
      const pageId = ctx.db.normalizeId("pages", args.pageId)
      if (!pageId) throw new Error("Page access denied")
      const { page, version, bindings } = await getPage(
        ctx,
        grant.workspaceId,
        pageId,
        args.revision
      )
      return {
        page: summary(page),
        version: version && {
          revision: version.revision,
          definition: version.definition,
          createdAt: version.createdAt,
        },
        bindings,
      }
    }),
})

export const list = internalQuery({
  args: {
    digest: v.string(),
    now: v.number(),
    numItems: v.number(),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    page: v.array(pageSummary),
    isDone: v.boolean(),
    continueCursor: v.string(),
  }),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, "read", async (grant) => {
      const result = await listPages(ctx, grant.workspaceId, {
        numItems: args.numItems,
        cursor: args.cursor,
      })
      return { ...result, page: result.page.map(summary) }
    }),
})
