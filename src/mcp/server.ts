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
  'Each field has an `id` (lowercase letters, numbers, underscores; unique), a `label`, and a `type`: "text", "number", or "boolean". Set `optional` to true when a record may leave the field out. Set `indexed` to true for fields you will filter or sort by (at most 5; indexed text is at most 200 characters).'

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
    'Add a field to a collection without changing its records. The new field is optional, so the records that exist have no value for it. The `field` has an `id` (lowercase letters, numbers, underscores; not used yet in the collection), a `label`, a `type`: "text", "number", or "boolean", and `indexed: true` when you will filter or sort by it. Returns the new schema version. Needs a read-and-write credential.',
  parameters: Schema.Struct({
    collectionId: Schema.String,
    field: Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      type: Schema.Literals(["text", "number", "boolean"]),
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

const DfeToolkit = Toolkit.make(
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
      "DFE stores workspace data in collections of typed records. Use workspace_describe to find collections and their fields, records_list to read records, and records_query to filter and sort them by an indexed field. Files are artifacts: artifacts_list and artifacts_download_url read them, and artifacts_create_upload then artifacts_complete_upload add one. With a read-and-write credential, collections_create, collections_add_field, records_create, records_update, and records_delete change data.",
    registrations: McpServer.toolkit(DfeToolkit).pipe(
      Layer.provideMerge(DfeToolkitHandlers)
    ),
  }).pipe(
    Layer.provide(CredentialMiddleware.layer),
    Layer.provide(AgentApi.layer(agentApiUrl)),
    Layer.provide(FetchHttpClient.layer)
  )
