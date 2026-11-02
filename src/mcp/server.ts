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
 * The read-only DFE MCP server at `/mcp`. It is stateless (MCP 2026-07-28):
 * each POST runs in its own request scope, as Cloudflare Workers require.
 * Every tool call forwards the caller's Bearer credential to the agent API.
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
  description: `List records of one collection, newest first. Returns up to \`limit\` records (1 to ${MAX_PAGE_SIZE}, default ${MAX_PAGE_SIZE}). When \`isDone\` is false, pass \`continueCursor\` as \`cursor\` to get the next page.`,
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

const DfeToolkit = Toolkit.make(DescribeWorkspace, ListRecords)

const DfeToolkitHandlers = DfeToolkit.toLayer(
  Effect.gen(function* () {
    const api = yield* AgentApi.AgentApi
    return {
      workspace_describe: () => api.describeWorkspace,
      records_list: (input) => api.listRecords(input),
    }
  })
)

const unauthorized = HttpServerResponse.text("Unauthorized", {
  status: 401,
  headers: { "WWW-Authenticate": 'Bearer realm="dfe"' },
})

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
      "DFE stores workspace data in collections of typed records. Use workspace_describe to find collections, then records_list to read them. Access is read-only.",
    registrations: McpServer.toolkit(DfeToolkit).pipe(
      Layer.provideMerge(DfeToolkitHandlers)
    ),
  }).pipe(
    Layer.provide(CredentialMiddleware.layer),
    Layer.provide(AgentApi.layer(agentApiUrl)),
    Layer.provide(FetchHttpClient.layer)
  )
