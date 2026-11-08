/// <reference types="@cloudflare/workers-types" />
import { Option, Schema } from "effect"

/**
 * Sends one PostHog event for each MCP message that `/mcp` answers, so we
 * can see which tools agents call, which clients they use, and which calls
 * fail. It sends only names, versions, outcomes, and durations: never tool
 * arguments, results, or the credential.
 *
 * The distinct ID is the SHA-256 digest of the credential, the same value
 * that convex/agentAccess.ts stores in `agentGrants.digest`. Without
 * `POSTHOG_PROJECT_KEY` it sends nothing.
 */
export interface McpAnalyticsEnv {
  readonly POSTHOG_PROJECT_KEY?: string
  /** For example https://eu.i.posthog.com. Default: https://us.i.posthog.com. */
  readonly POSTHOG_HOST?: string
}

const MAX_BODY_BYTES = 256 * 1024

const ClientInfo = Schema.Struct({
  name: Schema.String,
  version: Schema.optionalKey(Schema.String),
})
const Message = Schema.Struct({
  id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number])),
  method: Schema.String,
  params: Schema.optionalKey(
    Schema.Struct({
      name: Schema.optionalKey(Schema.String),
      _meta: Schema.optionalKey(
        Schema.Struct({
          "io.modelcontextprotocol/clientInfo": Schema.optionalKey(ClientInfo),
        })
      ),
    })
  ),
})
const Reply = Schema.Struct({
  id: Schema.optionalKey(
    Schema.Union([Schema.String, Schema.Number, Schema.Null])
  ),
  error: Schema.optionalKey(Schema.Struct({ code: Schema.Number })),
  result: Schema.optionalKey(
    Schema.Struct({ isError: Schema.optionalKey(Schema.Boolean) })
  ),
})
/** Decodes one JSON-RPC message, or a batch of them, as a list. */
function decodeList<A>(schema: Schema.Codec<A, unknown>) {
  const one = Schema.decodeUnknownOption(schema)
  const many = Schema.decodeUnknownOption(Schema.Array(schema))
  return (text: string): ReadonlyArray<A> =>
    Option.match(parseJson(text), {
      onNone: () => [],
      onSome: (json) =>
        Option.getOrElse(
          Option.orElse(many(json), () => Option.map(one(json), (a) => [a])),
          () => []
        ),
    })
}

const decodeMessages = decodeList(Message)
const decodeReplies = decodeList(Reply)

type Message = typeof Message.Type
type Reply = typeof Reply.Type
/** Properties of every event. */
type Common = {
  readonly http_status: number
  readonly duration_ms: number
  readonly user_agent: string
}
/** Properties of one MCP message. JSON leaves out undefined values. */
type MessageProperties = Common & {
  readonly method: string
  readonly outcome: "ok" | "error" | "unknown"
  readonly tool: string | undefined
  readonly client_name: string | undefined
  readonly client_version: string | undefined
  readonly error_code: number | undefined
}
type EventBody =
  | {
      readonly event: "mcp_tool_called" | "mcp_request"
      readonly properties: MessageProperties
    }
  | {
      readonly event: "mcp_unauthorized"
      readonly properties: Common & {
        readonly http_method: string
        readonly $process_person_profile: false
      }
    }
type Event = EventBody & {
  readonly distinct_id: string
  readonly timestamp: string
}

function parseJson(text: string): Option.Option<unknown> {
  try {
    return Option.some(JSON.parse(text))
  } catch {
    return Option.none()
  }
}

async function digest(token: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  )
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("")
}

/** Reads the replies of a JSON response; SSE and other bodies give none. */
async function readReplies(response: Response) {
  const type = response.headers.get("Content-Type") ?? ""
  if (!type.startsWith("application/json")) return []
  const text = await response.text()
  if (text.length > MAX_BODY_BYTES) return []
  return decodeReplies(text)
}

/** "error" for a JSON-RPC error or a tool result with `isError`. */
function outcome(reply: Reply | undefined): MessageProperties["outcome"] {
  if (reply === undefined) return "unknown"
  if (reply.error !== undefined || reply.result?.isError === true)
    return "error"
  return "ok"
}

function messageEvent(
  message: Message,
  replies: ReadonlyArray<Reply>,
  common: Common
): EventBody {
  const client = message.params?._meta?.["io.modelcontextprotocol/clientInfo"]
  const reply =
    message.id === undefined
      ? undefined
      : replies.find((candidate) => candidate.id === message.id)
  const tool =
    message.method === "tools/call" ? message.params?.name : undefined
  return {
    event: tool === undefined ? "mcp_request" : "mcp_tool_called",
    properties: {
      ...common,
      method: message.method,
      outcome: outcome(reply),
      tool,
      client_name: client?.name,
      client_version: client?.version,
      error_code: reply?.error?.code,
    },
  }
}

async function send(env: McpAnalyticsEnv, batch: ReadonlyArray<Event>) {
  const key = env.POSTHOG_PROJECT_KEY
  if (key === undefined || key === "" || batch.length === 0) return
  const host = env.POSTHOG_HOST ?? "https://us.i.posthog.com"
  try {
    await fetch(new URL("/batch/", host), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, batch }),
    })
  } catch {
    // Analytics must never change how /mcp answers.
  }
}

/**
 * Records the MCP messages in `request` and their outcome in `response`.
 * `request` and `response` must be unread copies. Call it in `waitUntil`.
 */
export async function trackMcp(
  env: McpAnalyticsEnv,
  request: Request,
  response: Response,
  durationMs: number
) {
  if (env.POSTHOG_PROJECT_KEY === undefined) return
  const timestamp = new Date().toISOString()
  const common: Common = {
    http_status: response.status,
    duration_ms: Math.round(durationMs),
    user_agent: request.headers.get("User-Agent") ?? "",
  }
  const token = /^Bearer ([a-f0-9]{64})$/.exec(
    request.headers.get("Authorization") ?? ""
  )?.[1]
  if (token === undefined) {
    await send(env, [
      {
        event: "mcp_unauthorized",
        distinct_id: "mcp_anonymous",
        timestamp,
        properties: {
          ...common,
          http_method: request.method,
          $process_person_profile: false,
        },
      },
    ])
    return
  }
  if (request.method !== "POST") return
  const text = await request.text()
  if (text.length > MAX_BODY_BYTES) return
  const messages = decodeMessages(text)
  const replies = await readReplies(response)
  const distinctId = await digest(token)
  await send(
    env,
    messages.map((message) => ({
      ...messageEvent(message, replies, common),
      distinct_id: distinctId,
      timestamp,
    }))
  )
}
