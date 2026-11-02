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
  type: Schema.Literals(["text", "number", "boolean"]),
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

const ErrorBody = Schema.Struct({ error: Schema.String })

export interface ListRecordsInput {
  readonly collectionId: string
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

type Call<A> = Effect.Effect<A, AgentApiError, AgentCredential>

export class AgentApi extends Context.Service<
  AgentApi,
  {
    readonly describeWorkspace: Call<typeof WorkspaceDescription.Type>
    readonly listRecords: (
      input: ListRecordsInput
    ) => Call<typeof RecordPage.Type>
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
        describeWorkspace: send(
          HttpClientRequest.get(url("/agent/workspace")),
          WorkspaceDescription
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
