import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import type { AgentScope } from "./lib/agentScope"
import {
  agentPageDefinitionValidator,
  pageDefinitionValidator,
  type AgentPageDefinition,
  type PageBlock,
  type PageDefinition,
} from "./lib/pageDomain"
import { getPage, listPages, publishPage, savePageDraft } from "./pages"
import { auditActor } from "./lib/auditEvents"
import { agentOperation, runOnce } from "./lib/operations"

/**
 * Page operations for agent credentials. convex/http.ts calls these after it
 * decodes the request with convex/lib/agentPageTransport.ts. The credential
 * check and the operation share one transaction (withGrant). Writes take an
 * optional `idempotencyKey` (see convex/lib/operations.ts).
 */

/** Turns the agent's ID strings into typed IDs, or names the bad block. */
function resolvePageIds(
  ctx: QueryCtx,
  definition: AgentPageDefinition
): PageDefinition {
  const blocks = definition.blocks.map((block, index): PageBlock => {
    const at = `Block ${index + 1} (${block.kind})`
    const queryIdOf = (raw: string) => {
      const queryId = ctx.db.normalizeId("queryDefinitions", raw)
      if (!queryId)
        throw new Error(
          `${at}: "${raw}" is not a saved query ID. Use queries_list to find one.`
        )
      return queryId
    }
    const artifactIdOf = (raw: string) => {
      const artifactId = ctx.db.normalizeId("artifacts", raw)
      if (!artifactId)
        throw new Error(
          `${at}: "${raw}" is not an artifact ID. Use artifacts_list to find one.`
        )
      return artifactId
    }
    if (block.kind === "markdown") return block
    if (block.kind === "artifact")
      return { ...block, artifactId: artifactIdOf(block.artifactId) }
    if (block.kind === "htmlReport") {
      const { live, ...rest } = block
      const artifactId = artifactIdOf(block.artifactId)
      return live
        ? {
            ...rest,
            artifactId,
            live: {
              bindings: live.bindings.map((binding) => ({
                ...binding,
                queryId: queryIdOf(binding.queryId),
              })),
            },
          }
        : { ...rest, artifactId }
    }
    return {
      ...block,
      binding: { ...block.binding, queryId: queryIdOf(block.binding.queryId) },
    }
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

const savedDraft = v.object({ pageId: v.id("pages"), revision: v.number() })

/**
 * A live HTML report runs authored scripts that can send the data they read
 * out of the frame (for example, by navigating it). So a credential that
 * saves live bindings must also be able to read data itself.
 */
function saveDraftScopes(definition: AgentPageDefinition): AgentScope[] {
  const live = definition.blocks.some(
    (block) => block.kind === "htmlReport" && block.live !== undefined
  )
  return live ? ["pages.write", "data.read"] : ["pages.write"]
}

export const saveDraft = internalMutation({
  args: {
    digest: v.string(),
    pageId: v.optional(v.string()),
    expectedRevision: v.optional(v.number()),
    definition: agentPageDefinitionValidator,
    idempotencyKey: v.optional(v.string()),
  },
  returns: savedDraft,
  handler: (ctx, { digest, idempotencyKey, ...args }) =>
    withGrant(
      ctx,
      digest,
      Date.now(),
      saveDraftScopes(args.definition),
      (grant) =>
        runOnce(
          ctx,
          agentOperation(grant, "pages.saveDraft", idempotencyKey, args),
          savedDraft,
          async () => {
            const pageId =
              args.pageId === undefined
                ? undefined
                : ctx.db.normalizeId("pages", args.pageId)
            if (args.pageId !== undefined && !pageId)
              throw new Error("Page access denied")
            return savePageDraft(
              ctx,
              grant.workspaceId,
              auditActor(grant.owner, grant),
              {
                pageId: pageId ?? undefined,
                expectedRevision: args.expectedRevision,
                definition: resolvePageIds(ctx, args.definition),
              }
            )
          }
        )
    ),
})

export const publish = internalMutation({
  args: {
    digest: v.string(),
    pageId: v.string(),
    revision: v.number(),
    expectedRevision: v.number(),
    expectedPublishedRevision: v.union(v.number(), v.null()),
    idempotencyKey: v.optional(v.string()),
  },
  returns: pageSummary,
  handler: (ctx, { digest, idempotencyKey, ...input }) =>
    withGrant(ctx, digest, Date.now(), ["pages.write"], (grant) =>
      runOnce(
        ctx,
        agentOperation(grant, "pages.publish", idempotencyKey, input),
        pageSummary,
        async () => {
          const { pageId, ...args } = input
          const id = ctx.db.normalizeId("pages", pageId)
          if (!id) throw new Error("Page access denied")
          await publishPage(
            ctx,
            grant.workspaceId,
            auditActor(grant.owner, grant),
            { ...args, pageId: id },
            "either"
          )
          const page = await ctx.db.get(id)
          if (!page) throw new Error("Page access denied")
          return summary(page)
        }
      )
    ),
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
    withGrant(ctx, args.digest, args.now, ["pages.read"], async (grant) => {
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
    withGrant(ctx, args.digest, args.now, ["pages.read"], async (grant) => {
      const result = await listPages(ctx, grant.workspaceId, {
        numItems: args.numItems,
        cursor: args.cursor,
      })
      return { ...result, page: result.page.map(summary) }
    }),
})
