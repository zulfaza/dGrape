import * as Queries from "../../convex/lib/agentQueryTransport"
import * as Recipes from "../../convex/lib/agentRecipeTransport"
import { Context, Effect, Layer, Schema } from "effect"
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http"

/**
 * Client for the credential-scoped agent HTTP API that Convex serves
 * (convex/http.ts). Convex checks every credential, so this adapter forwards
 * the caller's credential and never holds its own authority.
 */

/** The caller's workspace credential, provided per MCP request. */
export class AgentCredential extends Context.Service<
  AgentCredential,
  { readonly token: string }
>()("dfe/AgentCredential") {}

/** A failure the agent can act on. The message is safe to show the model. */
export class AgentApiError extends Schema.TaggedError<AgentApiError>()(
  "AgentApiError",
  { message: Schema.String }
) {}

export const Field = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  type: Schema.Literals(["text", "number", "boolean", "integer", "currency"]),
  optional: Schema.optionalKey(Schema.Literal(true)),
  indexed: Schema.optionalKey(Schema.Literal(true)),
})

export const WorkspaceDescription = Schema.Struct({
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String }),
  collections: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      fields: Schema.Array(Field),
    })
  ),
  collectionsTruncated: Schema.Boolean,
})

const RecordValue = Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
export const RecordValues = Schema.Record(Schema.String, RecordValue)

const Bound = Schema.Struct({
  value: RecordValue,
  inclusive: Schema.optionalKey(Schema.Boolean),
})

/** Keeps records whose value equals `eq`, or lies between the bounds. */
export const RecordWhere = Schema.Union([
  Schema.Struct({ eq: RecordValue }),
  Schema.Struct({
    lower: Schema.optionalKey(Bound),
    upper: Schema.optionalKey(Bound),
  }),
])

export const RecordPage = Schema.Struct({
  page: Schema.Array(
    Schema.Struct({
      _id: Schema.String,
      _creationTime: Schema.Number,
      revision: Schema.Number,
      values: RecordValues,
    })
  ),
  isDone: Schema.Boolean,
  continueCursor: Schema.String,
})

export const CreatedCollection = Schema.Struct({ id: Schema.String })

export const AddedField = Schema.Struct({ version: Schema.Number })

export const CreatedRecord = Schema.Struct({
  id: Schema.String,
  revision: Schema.Number,
  status: Schema.Literals(["created", "existing"]),
})

export const UpdatedRecord = Schema.Struct({ revision: Schema.Number })

export const DeletedRecord = Schema.Struct({
  status: Schema.Literal("deleted"),
})

const Artifact = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  contentType: Schema.String,
  size: Schema.Number,
  createdAt: Schema.String,
})

export const ArtifactPage = Schema.Struct({
  page: Schema.Array(Artifact),
  isDone: Schema.Boolean,
  continueCursor: Schema.String,
})

export const ArtifactUpload = Schema.Struct({
  uploadId: Schema.String,
  uploadUrl: Schema.String,
  expiresAt: Schema.String,
  next: Schema.String,
})

export const CreatedArtifact = Schema.Struct({ id: Schema.String })

export const ArtifactDownload = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  contentType: Schema.String,
  size: Schema.Number,
  createdAt: Schema.String,
  url: Schema.String,
  expiresInSeconds: Schema.Number,
})

export const Capabilities = Schema.Struct({
  workspace: Schema.Struct({ id: Schema.String, name: Schema.String }),
  scope: Schema.Literals(["readonly", "readwrite"]),
  capabilities: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      access: Schema.Literals(["read", "write"]),
      allowed: Schema.Boolean,
      description: Schema.String,
    })
  ),
})

export const CollectionDescription = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  version: Schema.Number,
  fields: Schema.Array(Field),
})

/** A connection without secret values: only the credential's safe metadata. */
export const Connection = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  origin: Schema.String,
  routes: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      method: Schema.Literals(["GET", "POST"]),
      queryKeys: Schema.Array(Schema.String),
      fields: Schema.Array(Schema.String),
    })
  ),
  credential: Schema.Struct({
    label: Schema.String,
    owner: Schema.Literals(["workspace", "user"]),
    status: Schema.Literals([
      "ready",
      "pending",
      "deleting",
      "deleted",
      "missing",
    ]),
  }),
  usable: Schema.Boolean,
})

export const ConnectionPage = Schema.Struct({
  page: Schema.Array(Connection),
  isDone: Schema.Boolean,
  continueCursor: Schema.String,
})

const ErrorBody = Schema.Struct({ error: Schema.String })

export interface ListRecordsInput {
  readonly collectionId: string
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}

export interface QueryRecordsInput {
  readonly collectionId: string
  readonly fieldId: string
  readonly order?: "asc" | "desc" | undefined
  readonly where?: typeof RecordWhere.Type | undefined
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}

export interface CreateCollectionInput {
  readonly name: string
  readonly fields: ReadonlyArray<typeof Field.Type>
}

export interface AddFieldInput {
  readonly collectionId: string
  readonly field: Omit<typeof Field.Type, "optional">
}

export interface CreateRecordInput {
  readonly collectionId: string
  readonly values: typeof RecordValues.Type
  readonly idempotencyKey?: string | undefined
}

export interface UpdateRecordInput {
  readonly collectionId: string
  readonly recordId: string
  readonly expectedRevision: number
  readonly values: typeof RecordValues.Type
}

export interface DeleteRecordInput {
  readonly collectionId: string
  readonly recordId: string
  readonly expectedRevision: number
}

export interface ListConnectionsInput {
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}

export interface ListArtifactsInput {
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}

type Call<A> = Effect.Effect<A, AgentApiError, AgentCredential>

export class AgentApi extends Context.Service<
  AgentApi,
  {
    readonly recipePublish: (
      input: typeof Recipes.PublishInput.Type
    ) => Call<typeof Schema.String.Type>
    readonly recipeVersions: (
      input: typeof Recipes.PageInput.Type
    ) => Call<typeof Recipes.VersionPage.Type>
    readonly recipeRuns: (
      input: typeof Recipes.PageInput.Type
    ) => Call<typeof Recipes.RunPage.Type>
    readonly recipeHistory: (
      input: typeof Recipes.HistoryInput.Type
    ) => Call<typeof Recipes.HistoryPage.Type>
    readonly recipeTrigger: (
      input: typeof Recipes.TriggerInput.Type
    ) => Call<typeof Schema.String.Type>
    readonly recipeSchedule: (
      input: typeof Recipes.ScheduleInput.Type
    ) => Call<typeof Schema.String.Type>
    readonly recipeSchedules: (
      input: typeof Recipes.PageInput.Type
    ) => Call<typeof Recipes.SchedulePage.Type>
    readonly recipeSetEnabled: (
      input: typeof Recipes.EnabledInput.Type
    ) => Call<typeof Schema.Null.Type>
    readonly recipeCancel: (
      input: typeof Recipes.CancelInput.Type
    ) => Call<typeof Schema.Null.Type>
    readonly recipeSetRunAccess: (
      input: typeof Recipes.AccessInput.Type
    ) => Call<typeof Schema.Null.Type>
    readonly querySave: (
      input: typeof Queries.SaveInput.Type
    ) => Call<typeof Queries.Saved.Type>
    readonly queryList: (
      input: typeof Queries.ListInput.Type
    ) => Call<typeof Queries.SavedQueryPage.Type>
    readonly queryRun: (
      input: typeof Queries.RunInput.Type
    ) => Call<typeof Queries.RunPage.Type>
    readonly describeWorkspace: Call<typeof WorkspaceDescription.Type>
    readonly capabilities: Call<typeof Capabilities.Type>
    readonly describeCollection: (input: {
      readonly collectionId: string
    }) => Call<typeof CollectionDescription.Type>
    readonly listConnections: (
      input: ListConnectionsInput
    ) => Call<typeof ConnectionPage.Type>
    readonly describeConnection: (input: {
      readonly connectionId: string
    }) => Call<typeof Connection.Type>
    readonly listRecords: (
      input: ListRecordsInput
    ) => Call<typeof RecordPage.Type>
    readonly queryRecords: (
      input: QueryRecordsInput
    ) => Call<typeof RecordPage.Type>
    readonly listArtifacts: (
      input: ListArtifactsInput
    ) => Call<typeof ArtifactPage.Type>
    readonly createArtifactUpload: (input: {
      readonly name: string
    }) => Call<typeof ArtifactUpload.Type>
    readonly completeArtifactUpload: (input: {
      readonly uploadId: string
    }) => Call<typeof CreatedArtifact.Type>
    readonly artifactDownload: (input: {
      readonly artifactId: string
    }) => Call<typeof ArtifactDownload.Type>
    readonly createCollection: (
      input: CreateCollectionInput
    ) => Call<typeof CreatedCollection.Type>
    readonly addField: (input: AddFieldInput) => Call<typeof AddedField.Type>
    readonly createRecord: (
      input: CreateRecordInput
    ) => Call<typeof CreatedRecord.Type>
    readonly updateRecord: (
      input: UpdateRecordInput
    ) => Call<typeof UpdatedRecord.Type>
    readonly deleteRecord: (
      input: DeleteRecordInput
    ) => Call<typeof DeletedRecord.Type>
  }
>()("dfe/AgentApi") {}

const UNAVAILABLE = "DFE is unavailable. Try again later."

/** A fallback for error responses that carry no message of their own. */
function statusMessage(status: number) {
  if (status === 401 || status === 403)
    return "The credential is missing, expired, or revoked, or it cannot access this collection."
  if (status === 400)
    return "The request is invalid. Check collectionId, limit (1 to 50), and cursor."
  return UNAVAILABLE
}

/** Builds the client for the agent API at `baseUrl` (the Convex site URL). */
export const layer = (baseUrl: string) =>
  Layer.effect(
    AgentApi,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const url = (path: string) => new URL(path, baseUrl).toString()

      /**
       * Sends `request` with the caller's credential. A 2xx body decodes with
       * `schema`; any other status becomes an AgentApiError that carries the
       * API's own reason when it gives one.
       */
      const send = <A>(
        request: HttpClientRequest.HttpClientRequest,
        schema: Schema.Codec<A, unknown>
      ): Call<A> =>
        Effect.gen(function* () {
          const { token } = yield* AgentCredential
          const response = yield* http.execute(
            HttpClientRequest.bearerToken(request, token)
          )
          if (response.status >= 200 && response.status < 300)
            return yield* HttpClientResponse.schemaBodyJson(schema)(response)
          const reason = yield* HttpClientResponse.schemaBodyJson(ErrorBody)(
            response
          ).pipe(
            Effect.map((body) => body.error),
            Effect.orElseSucceed(() => statusMessage(response.status))
          )
          return yield* new AgentApiError({ message: reason })
        }).pipe(
          Effect.catchTags({
            HttpClientError: () =>
              Effect.fail(new AgentApiError({ message: UNAVAILABLE })),
            SchemaError: () =>
              Effect.fail(new AgentApiError({ message: UNAVAILABLE })),
          })
        )

      const json = (
        request: HttpClientRequest.HttpClientRequest,
        body: unknown
      ) => HttpClientRequest.bodyJsonUnsafe(request, body)

      return {
        recipePublish: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/recipes/publish")), input),
            Schema.String
          ),
        recipeVersions: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/recipes/versions")), input),
            Recipes.VersionPage
          ),
        recipeRuns: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/recipes/runs")), input),
            Recipes.RunPage
          ),
        recipeHistory: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/recipes/history")), input),
            Recipes.HistoryPage
          ),
        recipeTrigger: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/recipes/trigger")), input),
            Schema.String
          ),
        recipeSchedule: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/recipes/schedule")), input),
            Schema.String
          ),
        recipeSchedules: (input) =>
          send(
            json(
              HttpClientRequest.post(url("/agent/recipes/schedules")),
              input
            ),
            Recipes.SchedulePage
          ),
        recipeSetEnabled: (input) =>
          send(
            json(
              HttpClientRequest.post(url("/agent/recipes/setEnabled")),
              input
            ),
            Schema.Null
          ),
        recipeCancel: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/recipes/cancel")), input),
            Schema.Null
          ),
        recipeSetRunAccess: (input) =>
          send(
            json(
              HttpClientRequest.post(url("/agent/recipes/setRunAccess")),
              input
            ),
            Schema.Null
          ),
        querySave: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/queries/save")), input),
            Queries.Saved
          ),
        queryList: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/queries/list")), input),
            Queries.SavedQueryPage
          ),
        queryRun: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/queries/run")), input),
            Queries.RunPage
          ),
        describeWorkspace: send(
          HttpClientRequest.get(url("/agent/workspace")),
          WorkspaceDescription
        ),
        capabilities: send(
          HttpClientRequest.get(url("/agent/capabilities")),
          Capabilities
        ),
        describeCollection: ({ collectionId }) =>
          send(
            HttpClientRequest.get(url("/agent/collections/describe")).pipe(
              HttpClientRequest.setUrlParams({ collectionId })
            ),
            CollectionDescription
          ),
        listConnections: ({ limit, cursor }) =>
          send(
            HttpClientRequest.get(url("/agent/connections")).pipe(
              HttpClientRequest.setUrlParams({
                ...(limit === undefined ? {} : { limit: String(limit) }),
                ...(cursor === undefined ? {} : { cursor }),
              })
            ),
            ConnectionPage
          ),
        describeConnection: ({ connectionId }) =>
          send(
            HttpClientRequest.get(url("/agent/connections/describe")).pipe(
              HttpClientRequest.setUrlParams({ connectionId })
            ),
            Connection
          ),
        listRecords: ({ collectionId, limit, cursor }) =>
          send(
            HttpClientRequest.get(url("/agent/records")).pipe(
              HttpClientRequest.setUrlParams({
                collectionId,
                ...(limit === undefined ? {} : { limit: String(limit) }),
                ...(cursor === undefined ? {} : { cursor }),
              })
            ),
            RecordPage
          ),
        queryRecords: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/records/query")), input),
            RecordPage
          ),
        listArtifacts: ({ limit, cursor }) =>
          send(
            HttpClientRequest.get(url("/agent/artifacts")).pipe(
              HttpClientRequest.setUrlParams({
                ...(limit === undefined ? {} : { limit: String(limit) }),
                ...(cursor === undefined ? {} : { cursor }),
              })
            ),
            ArtifactPage
          ),
        createArtifactUpload: (input) =>
          send(
            json(
              HttpClientRequest.post(url("/agent/artifacts/uploads")),
              input
            ),
            ArtifactUpload
          ),
        completeArtifactUpload: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/artifacts")), input),
            CreatedArtifact
          ),
        artifactDownload: ({ artifactId }) =>
          send(
            HttpClientRequest.get(url("/agent/artifacts/download")).pipe(
              HttpClientRequest.setUrlParams({ artifactId })
            ),
            ArtifactDownload
          ),
        createCollection: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/collections")), input),
            CreatedCollection
          ),
        addField: (input) =>
          send(
            json(
              HttpClientRequest.post(url("/agent/collections/fields")),
              input
            ),
            AddedField
          ),
        createRecord: (input) =>
          send(
            json(HttpClientRequest.post(url("/agent/records")), input),
            CreatedRecord
          ),
        updateRecord: (input) =>
          send(
            json(HttpClientRequest.patch(url("/agent/records")), input),
            UpdatedRecord
          ),
        deleteRecord: (input) =>
          send(
            json(HttpClientRequest.delete(url("/agent/records")), input),
            DeletedRecord
          ),
      }
    })
  )
