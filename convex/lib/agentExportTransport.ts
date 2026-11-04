import { Schema } from "effect"
import { Definition } from "./agentPageTransport.ts"
import { Field, Query } from "./agentQueryTransport.ts"
import { StoredRecipe, Timing } from "./agentRecipeTransport.ts"

/**
 * Wire contract of the workspace definition export. The HTTP route
 * (convex/http.ts) takes an empty body, and the MCP tool (src/mcp/server.ts)
 * decodes the result with WorkspaceExport. It matches
 * workspaceExportValidator in convex/lib/workspaceExport.ts.
 */

export const WORKSPACE_EXPORT_FORMAT = "dfe.workspace-definitions"
/** Changes when a change to the document could break a reader. */
export const WORKSPACE_EXPORT_FORMAT_VERSION = 1

export const ExportInput = Schema.Struct({})

const CollectionDefinition = Schema.Struct({
  version: Schema.Number,
  fields: Schema.Array(Field),
})

export const WorkspaceExport = Schema.Struct({
  format: Schema.Literal(WORKSPACE_EXPORT_FORMAT),
  formatVersion: Schema.Literal(WORKSPACE_EXPORT_FORMAT_VERSION),
  exportedAt: Schema.String,
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String }),
  collections: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      createdAt: Schema.String,
      definition: CollectionDefinition,
      history: Schema.Array(CollectionDefinition),
    })
  ),
  savedQueries: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      collectionId: Schema.String,
      name: Schema.String,
      revision: Schema.Number,
      createdAt: Schema.String,
      revisions: Schema.Array(
        Schema.Struct({
          revision: Schema.Number,
          schemaVersion: Schema.Number,
          query: Query,
          resultSchema: CollectionDefinition,
        })
      ),
    })
  ),
  recipes: Schema.Struct({
    versions: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        name: Schema.String,
        createdAt: Schema.String,
        recipe: StoredRecipe,
      })
    ),
    schedules: Schema.Array(
      Schema.Struct({
        id: Schema.String,
        versionId: Schema.String,
        timing: Timing,
        enabled: Schema.Boolean,
        revision: Schema.Number,
        createdAt: Schema.String,
      })
    ),
  }),
  pages: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      revision: Schema.Number,
      publishedRevision: Schema.NullOr(Schema.Number),
      createdAt: Schema.String,
      versions: Schema.Array(
        Schema.Struct({
          revision: Schema.Number,
          createdAt: Schema.String,
          definition: Definition,
        })
      ),
    })
  ),
})
