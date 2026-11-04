import * as Pages from "../../convex/lib/agentPageTransport"
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

const ListCapabilities = Tool.make("capabilities_list", {
  description:
    "List what this credential can do: its workspace, its scopes, and each capability with the scopes it needs and `allowed` true or false. Call this first to plan which tools you can use.",
  parameters: Tool.EmptyParams,
  success: AgentApi.Capabilities,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const DescribeCollection = Tool.make("collections_describe", {
  description:
    "Describe one collection: its name, schema `version`, and fields (id, label, type, optional, indexed). Use it before you write records or add a field.",
  parameters: Schema.Struct({ collectionId: Schema.String }),
  success: AgentApi.CollectionDescription,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const ListConnections = Tool.make("connections_list", {
  description: `List the connections that the credential owner can use in recipe fetch steps: origin, routes, credential label and status, and \`usable\`. Secret values are never returned. Returns up to \`limit\` (1 to ${MAX_PAGE_SIZE}). A page can have fewer items than \`limit\`; when \`isDone\` is false, pass \`continueCursor\` as \`cursor\`.`,
  parameters: Schema.Struct({
    limit: Schema.optionalKey(
      Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: MAX_PAGE_SIZE }))
    ),
    cursor: Schema.optionalKey(Schema.String),
  }),
  success: AgentApi.ConnectionPage,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const DescribeConnection = Tool.make("connections_describe", {
  description:
    "Describe one connection: its origin, each route (path, method, allowed query keys, returned fields, and `response`: where rows and the next page are in the response), and its credential label, owner, and status. `usable` is false when the credential is not ready or the origin is not approved. Secret values are never returned. A person adds credentials in the dashboard, never through MCP.",
  parameters: Schema.Struct({ connectionId: Schema.String }),
  success: AgentApi.Connection,
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
  description: `Filter and sort records by one indexed field (see \`indexed\` in workspace_describe). Records with no value for the field are left out. \`where\` is \`{ eq: value }\`, or \`{ lower?, upper? }\` where a bound is \`{ value, inclusive? }\` (inclusive is true by default). Values must have the field's type. A multiSelect field needs \`{ eq: option }\`, which finds records that chose that option. \`order\` is "asc" (default) or "desc". Returns up to \`limit\` records (1 to ${MAX_PAGE_SIZE}, default ${MAX_PAGE_SIZE}). When \`isDone\` is false, pass \`continueCursor\` as \`cursor\` with the same query to get the next page.`,
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
    "Start a file upload (at most 25 MB). Returns `uploadUrl` and `uploadId`. Then PUT the file bytes to `uploadUrl` with a Content-Type header (for example with curl --upload-file), and call artifacts_complete_upload with the `uploadId` within 15 minutes. Needs the artifacts.write scope.",
  parameters: Schema.Struct({ name: Schema.String }),
  success: AgentApi.ArtifactUpload,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const CompleteArtifactUpload = Tool.make("artifacts_complete_upload", {
  description:
    "Finish an upload after you PUT the file to its `uploadUrl`. Returns the artifact `id`. Needs the artifacts.write scope.",
  parameters: Schema.Struct({ uploadId: Schema.String }),
  success: AgentApi.CreatedArtifact,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const FieldsDescription =
  'Use integer for exact money in minor units (safe integers only), with a separate currency field (three uppercase letters, e.g. USD). Keep totals separate by currency. Each field has an `id` (lowercase letters, numbers, underscores; unique), a `label`, and a `type`: "text", "number", "boolean", "integer", "currency", "timestamp" (integer milliseconds since 1970-01-01T00:00:00Z), "date" (a calendar date as YYYY-MM-DD), "select" (one of the `options`), "multiSelect" (a list of different `options`), "recordReference" (the ID of a record in the collection `collectionId`, in this workspace), or "artifactReference" (the ID of an artifact in this workspace). A select or multiSelect field needs `options`: 1 to 100 different texts. A recordReference field needs `collectionId`. A referenced record or artifact cannot be deleted. Set `optional` to true when a record may leave the field out. Set `indexed` to true for fields you will filter or sort by (at most 5; indexed text is at most 200 characters; filter an indexed multiSelect field with `{ eq: option }`).'

const CreateCollection = Tool.make("collections_create", {
  description: `Create a collection in the workspace. Needs the data.write scope. ${FieldsDescription} Give 1 to 50 fields.`,
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
    'Add a field to a collection without changing its records. The new field is optional, so the records that exist have no value for it. The `field` has an `id` (lowercase letters, numbers, underscores; not used yet in the collection), a `label`, a `type`: "text", "number", "boolean", "integer", "currency", "timestamp" (integer milliseconds since 1970-01-01T00:00:00Z), "date" (a calendar date as YYYY-MM-DD), "select" (one of the `options`), "multiSelect" (a list of different `options`), "recordReference" (the ID of a record in the collection `collectionId`, in this workspace), or "artifactReference" (the ID of an artifact in this workspace). Set `indexed: true` when you will filter or sort by it. A select or multiSelect field needs `options`: 1 to 100 different texts. A recordReference field needs `collectionId`. A referenced record or artifact cannot be deleted. Returns the new schema version. Needs the data.write scope.',
  parameters: Schema.Struct({
    collectionId: Schema.String,
    field: AgentApi.NewField,
  }),
  success: AgentApi.AddedField,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const CreateRecord = Tool.make("records_create", {
  description:
    'Create a record. `values` must have one value for each required field of the collection, keyed by field id, with the field\'s type. Optional fields may be left out. Send an `idempotencyKey` (for example a source ID) so a retry returns the existing record instead of a duplicate (status "existing"). Needs the data.write scope.',
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
    "Replace all values of a record. Pass the record's current `revision` as `expectedRevision`. If the record changed since you read it, the call fails with the current revision: read the record again before you retry. Needs the data.write scope.",
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
    "Delete a record. You cannot undo this. Pass the record's current `revision` as `expectedRevision`. If the record changed since you read it, the call fails with the current revision: read the record again before you decide to delete it. If another record references it, the call fails with that record ID. Needs the data.write scope.",
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
    "List reusable job, transaction and GitHub activity schemas. Pass a template name and fields to collections_create. Dates use YYYY-MM-DD. Money uses signed minor units; keep currencies separate. A template with a github source needs a GitHub connection ID from the user: publish a recipe that fetches `read` with maxPages 1, maps each template field to itself, and upserts with source 'github' and the template's identityField.",
  parameters: Tool.EmptyParams,
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      description: Schema.String,
      fields: Schema.Array(AgentApi.Field),
      source: Schema.Union([
        Schema.Struct({ kind: Schema.Literal("manual") }),
        Schema.Struct({
          kind: Schema.Literal("github"),
          read: Schema.Literal("recent_authored_pull_requests"),
          identityField: Schema.Literal("id"),
        }),
      ]),
    })
  ),
}).annotate(Tool.Readonly, true)

const RecipePublish = Tool.make("recipes_publish", {
  description:
    "Publish an immutable recipe. Use recipes_validate and recipes_preview first. Requires jobs.manage, and connections.use for a fetch step.",
  parameters: Recipes.PublishInput,
  success: Schema.String,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const RecipeValidate = Tool.make("recipes_validate", {
  description:
    "Check a recipe before recipes_publish: its steps, limits, connections and output collection. Returns `ok: true`, or `ok: false` with the `error`. Saves nothing.",
  parameters: Recipes.ValidateInput,
  success: Recipes.ValidateResult,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const RecipePreview = Tool.make("recipes_preview", {
  description:
    "Dry run a recipe on `sample` rows (at most the recipe's row limit). The sample replaces the rows of the fetch step, so nothing is fetched; give an empty sample for a recipe without fetch. The output step saves nothing. Returns the row count after each step and the output rows, checked against the output collection fields, or `ok: false` with the `error`.",
  parameters: Recipes.PreviewInput,
  success: Recipes.PreviewResult,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

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
    "Start a recipe. Reuse idempotencyKey to retry. Requires jobs.run, and connections.use for a fetch step.",
  parameters: Recipes.TriggerInput,
  success: Schema.String,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const RecipeSchedule = Tool.make("recipes_schedule", {
  description:
    "Create a UTC schedule. Only the recipe creator can manage it. Requires jobs.manage, and connections.use for a fetch step. Overlap: a due run is skipped while the schedule's prior run is active. Catch-up: after missed occurrences, one run starts for the latest due time only.",
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
    "Enable or disable a schedule. Requires creator and jobs.manage. Enabling a recipe with a fetch step also requires connections.use.",
  parameters: Recipes.EnabledInput,
  success: Schema.Null,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const ScheduleUpdate = Tool.make("schedules_update", {
  description:
    "Change the timing and the pinned recipe version of a schedule. Read the schedule with recipes_schedules and pass its `revision` (0 when absent) as `expectedRevision`; if it changed, the call fails with the current revision. The next run time is computed again from now. Returns the new revision. Requires creator and jobs.manage, and connections.use for a fetch step. Overlap: a due run is skipped while the schedule's prior run is active. Catch-up: after missed occurrences, one run starts for the latest due time only.",
  parameters: Recipes.UpdateScheduleInput,
  success: Recipes.UpdateScheduleResult,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const RecipeCancel = Tool.make("recipes_cancel", {
  description: "Cancel a run. Requires recipe run permission and jobs.run.",
  parameters: Recipes.CancelInput,
  success: Schema.Null,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const RecipeRetry = Tool.make("recipes_retry", {
  description:
    "Retry a failed or cancelled run. Starts a new run of the same recipe version, linked by retryOf. Use a new idempotencyKey for each retry, and reuse it to repeat the same request. Requires recipe run permission and jobs.run, and connections.use for a fetch step.",
  parameters: Recipes.RetryInput,
  success: Schema.String,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const RecipeSetRunAccess = Tool.make("recipes_set_run_access", {
  description:
    "Grant or remove recipe run permission. Requires creator and jobs.manage.",
  parameters: Recipes.AccessInput,
  success: Schema.Null,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const QuerySave = Tool.make("queries_save", {
  description: `Save a records query so pages can show its results. \`query\` has the records_query shape: \`fieldId\` (an indexed field), \`order\`, and \`where\`. Each save makes a new immutable revision. To change a saved query, pass its \`queryId\` and its current \`revision\` as \`expectedRevision\`; if it changed since you read it, the call fails and you must list it again. Returns \`queryId\` and \`revision\`. Needs the data.write scope.`,
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

const PageSaveDraft = Tool.make("pages_save_draft", {
  description: `Save a page definition as a new draft revision. A draft is not visible on the published page until pages_publish. \`definition\` has a \`title\` and up to 20 \`blocks\`: markdown \`{ kind, text }\`, artifact \`{ kind, title, artifactId }\`, htmlReport \`{ kind, title, artifactId }\` (an HTML file with a report data timestamp, shown as a sandboxed static snapshot), and live blocks bound to a saved query revision (\`binding: { queryId, revision }\` from queries_list): table \`{ fields }\`, metric \`{ field, unit, operation: "sum" | "count" }\`, chart \`{ chart: { type: "bar" | "line" | "area" | "pie", labelField, valueField, unit } }\` or \`{ chart: { type: "scatter", labelField, xField, xUnit, valueField, unit } }\`. Bound fields must be in the query result, and sum and chart values (and the scatter \`xField\`) must be number fields. Pie values must be zero or more. An invalid block fails with its block number and the result fields. Omit \`pageId\` to create a page. To change a page, pass its \`pageId\` and its current \`revision\` as \`expectedRevision\`. Needs the pages.write scope.`,
  parameters: Pages.SaveDraftInput,
  success: Pages.SavedDraft,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, false)

const PagePublish = Tool.make("pages_publish", {
  description:
    "Publish a stored revision of a page, or roll back to an earlier one. Pass the page's current `revision` as `expectedRevision` and its current `publishedRevision` (null when never published) as `expectedPublishedRevision`, from pages_get or pages_list. If the page changed, the call fails: read it again. Bindings are checked again before publication. Needs the pages.write scope.",
  parameters: Pages.PublishInput,
  success: Pages.Published,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Destructive, true)

const PageGet = Tool.make("pages_get", {
  description:
    "Get a page and one version: `revision`, or the published one when you omit it (`version` is null when nothing is published). `bindings` has one entry for each block: null when the block is valid, or the problem (for example a stale query schema).",
  parameters: Pages.GetInput,
  success: Pages.PageDetail,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const PageList = Tool.make("pages_list", {
  description: `List the workspace's pages, newest first, with \`revision\` and \`publishedRevision\`. Returns up to \`limit\` (1 to ${Pages.MAX_PAGE_SIZE}). When \`isDone\` is false, pass \`continueCursor\` as \`cursor\`.`,
  parameters: Pages.ListInput,
  success: Pages.PageList,
  failure: AgentApi.AgentApiError,
  dependencies: [AgentApi.AgentCredential],
}).annotate(Tool.Readonly, true)

const DfeToolkit = Toolkit.make(
  RecipeValidate,
  RecipePreview,
  RecipePublish,
  RecipeVersions,
  RecipeRuns,
  RecipeHistory,
  RecipeTrigger,
  RecipeSchedule,
  RecipeSchedules,
  RecipeSetEnabled,
  ScheduleUpdate,
  RecipeCancel,
  RecipeRetry,
  RecipeSetRunAccess,

  QuerySave,
  QueryList,
  QueryRun,
  PageSaveDraft,
  PagePublish,
  PageGet,
  PageList,

  ListTemplates,
  ListCapabilities,
  DescribeWorkspace,
  DescribeCollection,
  ListConnections,
  DescribeConnection,
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
      recipes_validate: (input) => api.recipeValidate(input),
      recipes_preview: (input) => api.recipePreview(input),
      recipes_publish: (input) => api.recipePublish(input),
      recipes_versions: (input) => api.recipeVersions(input),
      recipes_runs: (input) => api.recipeRuns(input),
      recipes_history: (input) => api.recipeHistory(input),
      recipes_trigger: (input) => api.recipeTrigger(input),
      recipes_schedule: (input) => api.recipeSchedule(input),
      recipes_schedules: (input) => api.recipeSchedules(input),
      recipes_set_enabled: (input) => api.recipeSetEnabled(input),
      schedules_update: (input) => api.recipeUpdateSchedule(input),
      recipes_cancel: (input) => api.recipeCancel(input),
      recipes_retry: (input) => api.recipeRetry(input),
      recipes_set_run_access: (input) => api.recipeSetRunAccess(input),
      queries_save: (input) => api.querySave(input),
      queries_list: (input) => api.queryList(input),
      queries_run: (input) => api.queryRun(input),
      pages_save_draft: (input) => api.pageSaveDraft(input),
      pages_publish: (input) => api.pagePublish(input),
      pages_get: (input) => api.pageGet(input),
      pages_list: (input) => api.pageList(input),
      collections_templates: () => Effect.succeed(collectionTemplates()),
      capabilities_list: () => api.capabilities,
      workspace_describe: () => api.describeWorkspace,
      collections_describe: (input) => api.describeCollection(input),
      connections_list: (input) => api.listConnections(input),
      connections_describe: (input) => api.describeConnection(input),
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
      "DFE stores workspace data in collections of typed records. Call capabilities_list first to see what this credential can do. Use workspace_describe to find collections, collections_describe for the fields and schema version of one collection, records_list to read records, and records_query to filter and sort them by an indexed field. Files are artifacts: artifacts_list and artifacts_download_url read them, and artifacts_create_upload then artifacts_complete_upload add one. With the data.write scope, collections_create, collections_add_field, records_create, records_update, and records_delete change data. Saved queries are the data sources of pages: queries_save stores a records query as an immutable revision, queries_list finds saved queries and their result fields, and queries_run reads one revision. Pages show markdown, artifacts, and live blocks bound to saved query revisions: pages_save_draft stores a draft revision, pages_publish publishes or rolls back, and pages_get and pages_list read pages and report invalid bindings. " +
      "Recipes fetch and transform data without a model. A recipe fetch step uses a connection: connections_list and connections_describe show each connection's origin, routes, and credential status, never secret values. A person adds credentials in the dashboard. recipes_publish saves an immutable recipe version (fetch, map, filter, join, aggregate, upsert, snapshot, and artifact steps); recipes_versions lists versions. recipes_trigger starts a run (reuse its idempotencyKey to retry), recipes_runs lists runs, recipes_history lists the attempts of one run, and recipes_cancel stops a run. recipes_schedule creates a UTC schedule, recipes_schedules lists schedules, recipes_set_enabled turns one on or off, and recipes_set_run_access lets another user run a recipe. Only the recipe creator manages schedules and run access.",
    registrations: McpServer.toolkit(DfeToolkit).pipe(
      Layer.provideMerge(DfeToolkitHandlers)
    ),
  }).pipe(
    Layer.provide(CredentialMiddleware.layer),
    Layer.provide(AgentApi.layer(agentApiUrl)),
    Layer.provide(FetchHttpClient.layer)
  )
