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

const Field = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  type: Schema.Literals(["text", "number", "boolean"]),
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

export const RecordPage = Schema.Struct({
  page: Schema.Array(
    Schema.Struct({
      _id: Schema.String,
      _creationTime: Schema.Number,
      revision: Schema.Number,
      values: Schema.Record(
        Schema.String,
        Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
      ),
    })
  ),
  isDone: Schema.Boolean,
  continueCursor: Schema.String,
})

export interface ListRecordsInput {
  readonly collectionId: string
  readonly limit?: number | undefined
  readonly cursor?: string | undefined
}

export class AgentApi extends Context.Service<
  AgentApi,
  {
    readonly describeWorkspace: Effect.Effect<
      typeof WorkspaceDescription.Type,
      AgentApiError,
      AgentCredential
    >
    readonly listRecords: (
      input: ListRecordsInput
    ) => Effect.Effect<typeof RecordPage.Type, AgentApiError, AgentCredential>
  }
>()("dfe/AgentApi") {}

function statusMessage(status: number) {
  if (status === 401 || status === 403)
    return "The credential is missing, expired, or revoked, or it cannot read this collection."
  if (status === 400)
    return "The request is invalid. Check collectionId, limit (1 to 50), and cursor."
  return "DFE is unavailable. Try again later."
}

/** Builds the client for the agent API at `baseUrl` (the Convex site URL). */
export const layer = (baseUrl: string) =>
  Layer.effect(
    AgentApi,
    Effect.gen(function* () {
      const http = yield* HttpClient.HttpClient
      const get = <A>(
        path: string,
        params: Record<string, string>,
        schema: Schema.Codec<A, unknown>
      ) =>
        Effect.gen(function* () {
          const { token } = yield* AgentCredential
          const request = HttpClientRequest.get(
            new URL(path, baseUrl).toString()
          ).pipe(
            HttpClientRequest.setUrlParams(params),
            HttpClientRequest.bearerToken(token)
          )
          const response = yield* http.execute(request)
          if (response.status !== 200)
            return yield* new AgentApiError({
              message: statusMessage(response.status),
            })
          return yield* HttpClientResponse.schemaBodyJson(schema)(response)
        }).pipe(
          Effect.catchTags({
            HttpClientError: () =>
              Effect.fail(new AgentApiError({ message: statusMessage(503) })),
            SchemaError: () =>
              Effect.fail(new AgentApiError({ message: statusMessage(503) })),
          })
        )
      return {
        describeWorkspace: get("/agent/workspace", {}, WorkspaceDescription),
        listRecords: ({ collectionId, limit, cursor }) =>
          get(
            "/agent/records",
            {
              collectionId,
              ...(limit === undefined ? {} : { limit: String(limit) }),
              ...(cursor === undefined ? {} : { cursor }),
            },
            RecordPage
          ),
      }
    })
  )
