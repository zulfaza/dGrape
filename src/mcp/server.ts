import * as Queries from "../../convex/lib/agentQueryTransport"
import * as Recipes from "../../convex/lib/agentRecipeTransport"
import { collectionTemplates } from "../../convex/lib/collectionTemplates"
import { Effect, Layer, Schema } from "effect"
import { McpProtocol, McpServer, Tool, Toolkit } from "effect/ai"
import {
  FetchHttpClient,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/http"
import * as AgentApi from "./agent-api"

/**
 * The DFE MCP server at `/mcp`. It is stateless (MCP 2026-07-28): each POST
 * runs in its own request scope, as Cloudflare Workers require. Every tool
 * call forwards the caller's Bearer credential to the agent API, which
 * decides what the credential may read or write.
 */

const MAX_PAGE_SIZE = 50

const DescribeWorkspace = Tool.make("workspace_describe", {
  description:
    "Describe the workspace this credential can read: its name and each collection with its fields. Call this first to find collection IDs.",
  success: AgentApi.WorkspaceDescription,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const ListRecords = Tool.make("records_list", {
  description: `List records of one collection, oldest first. Returns up to \`limit\` records (1 to ${MAX_PAGE_SIZE}, default ${MAX_PAGE_SIZE}). When \`isDone\` is false, pass \`continueCursor\` as \`cursor\` to get the next page.`,
  parameters: Schema.Struct({
    collectionId: Schema.String,
    limit: Schema.optionalKey(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_PAGE_SIZE }))
    ),
    cursor: Schema.optionalKey(Schema.String),
  }),
  success: AgentApi.RecordPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const QueryRecords = Tool.make("records_query", {
  description: `Filter and sort records by one indexed field (see \`indexed\` in workspace_describe). Records with no value for the field are left out. \`where\` is \`{ eq: value }\`, or \`{ lower?, upper? }\` where a bound is \`{ value, inclusive? }\` (inclusive is true by default). Values must have the field's type. \`order\` is "asc" (default) or "desc". Returns up to \`limit\` records (1 to ${MAX_PAGE_SIZE}, default ${MAX_PAGE_SIZE}). When \`isDone\` is false, pass \`continueCursor\` as \`cursor\` with the same query to get the next page.`,
  parameters: Schema.Struct({
    collectionId: Schema.String,
    fieldId: Schema.String,
    order: Schema.optionalKey(Schema.Literals(["asc", "desc"])),
    where: Schema.optionalKey(AgentApi.RecordWhere),
    limit: Schema.optionalKey(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_PAGE_SIZE }))
    ),
    cursor: Schema.optionalKey(Schema.String),
  }),
  success: AgentApi.RecordPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const ListArtifacts = Tool.make("artifacts_list", {
  description: `List the workspace's files (artifacts), newest first: name, content type, size in bytes. Returns up to \`limit\` (1 to ${MAX_PAGE_SIZE}). When \`isDone\` is false, pass \`continueCursor\` as \`cursor\`.`,
  parameters: Schema.Struct({
    limit: Schema.optionalKey(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_PAGE_SIZE }))
    ),
    cursor: Schema.optionalKey(Schema.String),
  }),
  success: AgentApi.ArtifactPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const DownloadArtifact = Tool.make("artifacts_download_url", {
  description:
    "Get a signed URL to download one artifact. The URL works for 5 minutes and needs no credential: GET it with any HTTP client.",
  parameters: Schema.Struct({ artifactId: Schema.String }),
  success: AgentApi.ArtifactDownload,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const CreateArtifactUpload = Tool.make("artifacts_create_upload", {
  description:
    "Start a file upload (at most 25 MB). Returns `uploadUrl` and `uploadId`. Then PUT the file bytes to `uploadUrl` with a Content-Type header (for example with curl --upload-file), and call artifacts_complete_upload with the `uploadId` within 15 minutes. Needs a read-and-write credential.",
  parameters: Schema.Struct({ name: Schema.String }),
  success: AgentApi.ArtifactUpload,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const CompleteArtifactUpload = Tool.make("artifacts_complete_upload", {
  description:
    "Finish an upload after you PUT the file to its `uploadUrl`. Returns the artifact `id`. Needs a read-and-write credential.",
  parameters: Schema.Struct({ uploadId: Schema.String }),
  success: AgentApi.CreatedArtifact,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const FieldsDescription =
  'Use integer for exact money in minor units (safe integers only), with a separate currency field (three uppercase letters, e.g. USD). Keep totals separate by currency. Each field has an `id` (lowercase letters, numbers, underscores; unique), a `label`, and a `type`: "text", "number", "boolean", "integer", or "currency". Set `optional` to true when a record may leave the field out. Set `indexed` to true for fields you will filter or sort by (at most 5; indexed text is at most 200 characters).'

const CreateCollection = Tool.make("collections_create", {
  description: `Create a collection in the workspace. Needs a read-and-write credential. ${FieldsDescription} Give 1 to 50 fields.`,
  parameters: Schema.Struct({
    name: Schema.String,
    fields: Schema.Array(AgentApi.Field),
  }),
  success: AgentApi.CreatedCollection,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const AddField = Tool.make("collections_add_field", {
  description:
    'Add a field to a collection without changing its records. The new field is optional, so the records that exist have no value for it. The `field` has an `id` (lowercase letters, numbers, underscores; not used yet in the collection), a `label`, a `type`: "text", "number", "boolean", "integer", or "currency", and `indexed: true` when you will filter or sort by it. Returns the new schema version. Needs a read-and-write credential.',
  parameters: Schema.Struct({
    collectionId: Schema.String,
    field: Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      type: Schema.Literals([
        "text",
        "number",
        "boolean",
        "integer",
        "currency",
      ]),
      indexed: Schema.optionalKey(Schema.Literal(true)),
    }),
  }),
  success: AgentApi.AddedField,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const CreateRecord = Tool.make("records_create", {
  description:
    'Create a record. `values` must have one value for each required field of the collection, keyed by field id, with the field\'s type. Optional fields may be left out. Send an `idempotencyKey` (for example a source ID) so a retry returns the existing record instead of a duplicate (status "existing"). Needs a read-and-write credential.',
  parameters: Schema.Struct({
    collectionId: Schema.String,
    values: AgentApi.RecordValues,
    idempotencyKey: Schema.optionalKey(Schema.String),
  }),
  success: AgentApi.CreatedRecord,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const UpdateRecord = Tool.make("records_update", {
  description:
    "Replace all values of a record. Pass the record's current `revision` as `expectedRevision`. If the record changed since you read it, the call fails with the current revision: read the record again before you retry. Needs a read-and-write credential.",
  parameters: Schema.Struct({
    collectionId: Schema.String,
    recordId: Schema.String,
    expectedRevision: Schema.Int,
    values: AgentApi.RecordValues,
  }),
  success: AgentApi.UpdatedRecord,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
})

const DeleteRecord = Tool.make("records_delete", {
  description:
    "Delete a record. You cannot undo this. Pass the record's current `revision` as `expectedRevision`. If the record changed since you read it, the call fails with the current revision: read the record again before you decide to delete it. Needs a read-and-write credential.",
  parameters: Schema.Struct({
    collectionId: Schema.String,
    recordId: Schema.String,
    expectedRevision: Schema.Int,
  }),
  success: AgentApi.DeletedRecord,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const ListTemplates = Tool.make("collections_templates", {
  description:
    "List reusable job and transaction schemas. Pass a template name and fields to collections_create. Dates use YYYY-MM-DD. Money uses signed minor units; keep currencies separate.",
  parameters: Tool.EmptyParams,
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      description: Schema.String,
      fields: Schema.Array(AgentApi.Field),
    })
  ),
}).annotate(Tool.Readonly, true)

const RecipePublish = Tool.make("recipes_publish", {
  description: "Publish an immutable recipe. Requires write access.",
  parameters: Recipes.PublishInput,
  success: Schema.String,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const RecipeVersions = Tool.make("recipes_versions", {
  description: "List recipe versions. Use continueCursor for the next page.",
  parameters: Recipes.PageInput,
  success: Recipes.VersionPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const RecipeRuns = Tool.make("recipes_runs", {
  description: "List recipe runs. Use continueCursor for the next page.",
  parameters: Recipes.PageInput,
  success: Recipes.RunPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const RecipeHistory = Tool.make("recipes_history", {
  description:
    "List attempts for one run. Use continueCursor for the next page.",
  parameters: Recipes.HistoryInput,
  success: Recipes.HistoryPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const RecipeTrigger = Tool.make("recipes_trigger", {
  description:
    "Start a recipe. Reuse idempotencyKey to retry. Requires write access.",
  parameters: Recipes.TriggerInput,
  success: Schema.String,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const RecipeSchedule = Tool.make("recipes_schedule", {
  description:
    "Create a UTC schedule. Only the recipe creator can manage it. Requires write access.",
  parameters: Recipes.ScheduleInput,
  success: Schema.String,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const RecipeSchedules = Tool.make("recipes_schedules", {
  description: "List schedules. Use continueCursor for the next page.",
  parameters: Recipes.PageInput,
  success: Recipes.SchedulePage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const RecipeSetEnabled = Tool.make("recipes_set_enabled", {
  description:
    "Enable or disable a schedule. Requires creator and write access.",
  parameters: Recipes.EnabledInput,
  success: Schema.Null,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const RecipeCancel = Tool.make("recipes_cancel", {
  description: "Cancel a run. Requires recipe run permission and write access.",
  parameters: Recipes.CancelInput,
  success: Schema.Null,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const RecipeSetRunAccess = Tool.make("recipes_set_run_access", {
  description:
    "Grant or remove recipe run permission. Requires creator and write access.",
  parameters: Recipes.AccessInput,
  success: Schema.Null,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const QuerySave = Tool.make("queries_save", {
  description: `Save a records query so pages can show its results. \`query\` has the records_query shape: \`fieldId\` (an indexed field), \`order\`, and \`where\`. Each save makes a new immutable revision. To change a saved query, pass its \`queryId\` and its current \`revision\` as \`expectedRevision\`; if it changed since you read it, the call fails and you must list it again. Returns \`queryId\` and \`revision\`. Needs a read-and-write credential.`,
  parameters: Queries.SaveInput,
  success: Queries.Saved,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const QueryList = Tool.make("queries_list", {
  description: `List the workspace's saved queries with their current \`revision\` and result \`fields\`. \`status\` is "stale" when the collection schema changed after that revision: save the query again before you use it. Returns up to \`limit\` (1 to ${Queries.MAX_PAGE_SIZE}). When \`isDone\` is false, pass \`continueCursor\` as \`cursor\`.`,
  parameters: Queries.ListInput,
  success: Queries.SavedQueryPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const QueryRun = Tool.make("queries_run", {
  description: `Run one revision of a saved query. Returns up to \`limit\` records (1 to ${Queries.MAX_PAGE_SIZE}), the result schema, and \`completeness\` ("partial" when more pages remain or the read budget stopped the page). When \`isDone\` is false, pass \`continueCursor\` as \`cursor\`.`,
  parameters: Queries.RunInput,
  success: Queries.RunPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const DfeToolkit = Toolkit.make(
  RecipePublish,
  RecipeVersions,
  RecipeRuns,
  RecipeHistory,
  RecipeTrigger,
  RecipeSchedule,
  RecipeSchedules,
  RecipeSetEnabled,
  RecipeCancel,
  RecipeSetRunAccess,

  QuerySave,
  QueryList,
  QueryRun,

  ListTemplates,
  DescribeWorkspace,
  ListRecords,
  QueryRecords,
  ListArtifacts,
  DownloadArtifact,
  CreateArtifactUpload,
  CompleteArtifactUpload,
  CreateCollection,
  AddField,
  CreateRecord,
  UpdateRecord,
  DeleteRecord
)

const DfeToolkitHandlers = DfeToolkit.toLayer(
  Effect.gen(function* () {
    const api = yield* AgentApi.AgentApi
    return {
      recipes_publish: (input) => api.recipePublish(input),
      recipes_versions: (input) => api.recipeVersions(input),
      recipes_runs: (input) => api.recipeRuns(input),
      recipes_history: (input) => api.recipeHistory(input),
      recipes_trigger: (input) => api.recipeTrigger(input),
      recipes_schedule: (input) => api.recipeSchedule(input),
      recipes_schedules: (input) => api.recipeSchedules(input),
      recipes_set_enabled: (input) => api.recipeSetEnabled(input),
      recipes_cancel: (input) => api.recipeCancel(input),
      recipes_set_run_access: (input) => api.recipeSetRunAccess(input),
      queries_save: (input) => api.querySave(input),
      queries_list: (input) => api.queryList(input),
      queries_run: (input) => api.queryRun(input),
      collections_templates: () => Effect.succeed(collectionTemplates()),
      workspace_describe: () => api.describeWorkspace,
      records_list: (input) => api.listRecords(input),
      records_query: (input) => api.queryRecords(input),
      artifacts_list: (input) => api.listArtifacts(input),
      artifacts_download_url: (input) => api.artifactDownload(input),
      artifacts_create_upload: (input) => api.createArtifactUpload(input),
      artifacts_complete_upload: (input) => api.completeArtifactUpload(input),
      collections_create: (input) => api.createCollection(input),
      collections_add_field: (input) => api.addField(input),
      records_create: (input) => api.createRecord(input),
      records_update: (input) => api.updateRecord(input),
      records_delete: (input) => api.deleteRecord(input),
    }
  })
)

// src/routes/mcp.ts adds the WWW-Authenticate discovery hint.
const unauthorized = HttpServerResponse.text("Unauthorized", { status: 401 })

/** Rejects requests without a well-formed credential before MCP runs. */
const CredentialMiddleware = HttpRouter.middleware<{
  provides: AgentApi.AgentCredential
}>()((effect) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const token = /^Bearer ([a-f0-9]{64})$/.exec(
      request.headers.authorization ?? ""
    )?.[1]
    if (!token) return unauthorized
    return yield* Effect.provideService(effect, AgentApi.AgentCredential, {
      token,
    })
  })
)

/** Builds the `/mcp` app. `agentApiUrl` is the Convex site URL. */
export const makeMcpApp = (agentApiUrl: string) =>
  McpServer.layerHttpRequestScoped({
    name: "DFE",
    version: "0.1.0",
    path: "/mcp",
    protocols: [McpProtocol.v2026_07_28],
    instructions:
      "DFE stores workspace data in collections of typed records. Use workspace_describe to find collections and their fields, records_list to read records, and records_query to filter and sort them by an indexed field. Files are artifacts: artifacts_list and artifacts_download_url read them, and artifacts_create_upload then artifacts_complete_upload add one. With a read-and-write credential, collections_create, collections_add_field, records_create, records_update, and records_delete change data. Saved queries are the data sources of pages: queries_save stores a records query as an immutable revision, queries_list finds saved queries and their result fields, and queries_run reads one revision.",
    registrations: McpServer.toolkit(DfeToolkit).pipe(
      Layer.provideMerge(DfeToolkitHandlers)
    ),
  }).pipe(
    Layer.provide(CredentialMiddleware.layer),
    Layer.provide(AgentApi.layer(agentApiUrl)),
    Layer.provide(FetchHttpClient.layer)
  )
