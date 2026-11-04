import { v, type Infer } from "convex/values"
import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { collectionDefinitionValidator } from "./collectionDomain"
import { pageDefinitionValidator } from "./pageDomain"
import { recipeValidator } from "./recipeDomain"
import { recipeTimingValidator } from "./recipeSchedule"
import { recordQueryValidator } from "./recordQuery"
import {
  WORKSPACE_EXPORT_FORMAT,
  WORKSPACE_EXPORT_FORMAT_VERSION,
} from "./agentExportTransport"

/**
 * Workspace definition export: one JSON document with the collection
 * schemas (with their stored history), saved queries (with every revision),
 * recipe versions and schedules, and pages (with every version).
 *
 * The document keeps the stored IDs, so references between definitions
 * (a page binding to a query revision, a recipe step to a collection or a
 * connection) stay valid. It never contains secret values, connection
 * credentials, records, run state, or user IDs: it reads only the
 * definition tables below.
 *
 * convex/lib/agentExportTransport.ts is the same contract for MCP clients.
 */

/**
 * One query reads at most these totals. They stay well below the Convex
 * read and result limits, so a large workspace fails with a clear message
 * and not with a platform error.
 */
export const MAX_EXPORT_DOCUMENTS = 8000
export const MAX_EXPORT_BYTES = 8_000_000

const timestamp = v.string()

export const workspaceExportValidator = v.object({
  format: v.literal(WORKSPACE_EXPORT_FORMAT),
  formatVersion: v.literal(WORKSPACE_EXPORT_FORMAT_VERSION),
  exportedAt: timestamp,
  workspace: v.object({ id: v.id("workspaces"), name: v.string() }),
  collections: v.array(
    v.object({
      id: v.id("collections"),
      name: v.string(),
      createdAt: timestamp,
      definition: collectionDefinitionValidator,
      /**
       * Stored definitions, oldest first. Collections made before schema
       * history have no entries until their first schema change.
       */
      history: v.array(collectionDefinitionValidator),
    })
  ),
  savedQueries: v.array(
    v.object({
      id: v.id("queryDefinitions"),
      collectionId: v.id("collections"),
      name: v.string(),
      revision: v.number(),
      createdAt: timestamp,
      /** Every revision, oldest first. */
      revisions: v.array(
        v.object({
          revision: v.number(),
          schemaVersion: v.number(),
          query: recordQueryValidator,
          resultSchema: collectionDefinitionValidator,
        })
      ),
    })
  ),
  recipes: v.object({
    /** Immutable recipe versions, oldest first. */
    versions: v.array(
      v.object({
        id: v.id("recipeVersions"),
        name: v.string(),
        createdAt: timestamp,
        recipe: recipeValidator,
      })
    ),
    schedules: v.array(
      v.object({
        id: v.id("recipeSchedules"),
        versionId: v.id("recipeVersions"),
        timing: recipeTimingValidator,
        enabled: v.boolean(),
        revision: v.number(),
        createdAt: timestamp,
      })
    ),
  }),
  pages: v.array(
    v.object({
      id: v.id("pages"),
      title: v.string(),
      revision: v.number(),
      publishedRevision: v.union(v.number(), v.null()),
      createdAt: timestamp,
      /** Every version, oldest first. */
      versions: v.array(
        v.object({
          revision: v.number(),
          createdAt: timestamp,
          definition: pageDefinitionValidator,
        })
      ),
    })
  ),
})

export type WorkspaceExport = Infer<typeof workspaceExportValidator>

export type WorkspaceExportResult =
  | { kind: "ok"; document: WorkspaceExport }
  | { kind: "tooLarge"; message: string }

export const workspaceExportResultValidator = v.union(
  v.object({ kind: v.literal("ok"), document: workspaceExportValidator }),
  v.object({ kind: v.literal("tooLarge"), message: v.string() })
)

/** Thrown when the export reads more than its budget. */
class ExportTooLarge extends Error {}

/** The stored definitions that an export reads. */
type ExportedDocument =
  | Doc<"collections">
  | Doc<"collectionSchemaVersions">
  | Doc<"queryDefinitions">
  | Doc<"queryDefinitionVersions">
  | Doc<"recipeVersions">
  | Doc<"recipeSchedules">
  | Doc<"pages">
  | Doc<"pageVersions">

/** Counts what the export reads, and stops it at the first excess. */
function exportBudget() {
  let documents = 0
  let bytes = 0
  return (document: ExportedDocument) => {
    documents += 1
    bytes += new TextEncoder().encode(JSON.stringify(document)).byteLength
    if (documents > MAX_EXPORT_DOCUMENTS || bytes > MAX_EXPORT_BYTES)
      throw new ExportTooLarge(
        `The workspace definitions are too large to export: the limit is ${MAX_EXPORT_DOCUMENTS.toLocaleString("en-US")} stored definitions or ${MAX_EXPORT_BYTES / 1_000_000} MB.`
      )
  }
}

const iso = (time: number) => new Date(time).toISOString()

/**
 * Builds the export of `workspaceId`. The caller authorizes access first.
 * `exportedAt` is the caller's clock, because a query cannot read one.
 */
export async function exportWorkspace(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  exportedAt: number
): Promise<WorkspaceExportResult> {
  const workspace = await ctx.db.get(workspaceId)
  if (!workspace) throw new Error("Workspace access denied")
  const count = exportBudget()
  /** Reads every row of `rows` within the budget, in index order. */
  async function all<T extends ExportedDocument>(rows: AsyncIterable<T>) {
    const read: T[] = []
    for await (const row of rows) {
      count(row)
      read.push(row)
    }
    return read
  }
  try {
    const collections = []
    for (const collection of await all(
      ctx.db
        .query("collections")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
    )) {
      const history = await all(
        ctx.db
          .query("collectionSchemaVersions")
          .withIndex("by_collectionId_and_version", (q) =>
            q.eq("collectionId", collection._id)
          )
      )
      collections.push({
        id: collection._id,
        name: collection.name,
        createdAt: iso(collection._creationTime),
        definition: collection.definition,
        history: history.map((row) => row.definition),
      })
    }

    const savedQueries = []
    for (const query of await all(
      ctx.db
        .query("queryDefinitions")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    )) {
      const revisions = await all(
        ctx.db
          .query("queryDefinitionVersions")
          .withIndex("by_queryId_and_revision", (q) =>
            q.eq("queryId", query._id)
          )
      )
      savedQueries.push({
        id: query._id,
        collectionId: query.collectionId,
        name: query.name,
        revision: query.revision,
        createdAt: iso(query._creationTime),
        revisions: revisions.map((row) => ({
          revision: row.revision,
          schemaVersion: row.schemaVersion,
          query: row.query,
          resultSchema: row.resultSchema,
        })),
      })
    }

    const versions = await all(
      ctx.db
        .query("recipeVersions")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    )
    const schedules = await all(
      ctx.db
        .query("recipeSchedules")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    )

    const pages = []
    for (const page of await all(
      ctx.db
        .query("pages")
        .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    )) {
      const pageVersions = await all(
        ctx.db
          .query("pageVersions")
          .withIndex("by_pageId_and_revision", (q) => q.eq("pageId", page._id))
      )
      pages.push({
        id: page._id,
        title: page.title,
        revision: page.revision,
        publishedRevision: page.publishedRevision ?? null,
        createdAt: iso(page._creationTime),
        versions: pageVersions.map((row) => ({
          revision: row.revision,
          createdAt: iso(row.createdAt),
          definition: row.definition,
        })),
      })
    }

    return {
      kind: "ok",
      document: {
        format: WORKSPACE_EXPORT_FORMAT,
        formatVersion: WORKSPACE_EXPORT_FORMAT_VERSION,
        exportedAt: iso(exportedAt),
        workspace: { id: workspace._id, name: workspace.name },
        collections,
        savedQueries,
        recipes: {
          versions: versions.map(recipeVersion),
          schedules: schedules.map(recipeSchedule),
        },
        pages,
      },
    }
  } catch (error) {
    if (error instanceof ExportTooLarge)
      return { kind: "tooLarge", message: error.message }
    throw error
  }
}

/** Leaves out `createdBy` (a user ID) and `workspaceId`. */
function recipeVersion(row: Doc<"recipeVersions">) {
  return {
    id: row._id,
    name: row.name,
    createdAt: iso(row._creationTime),
    recipe: row.recipe,
  }
}

/** Leaves out run state: `nextAt` and `activeRunId`. */
function recipeSchedule(row: Doc<"recipeSchedules">) {
  return {
    id: row._id,
    versionId: row.versionId,
    timing: row.timing,
    enabled: row.enabled,
    revision: row.revision ?? 0,
    createdAt: iso(row._creationTime),
  }
}
