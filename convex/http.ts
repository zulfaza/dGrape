import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { digestToken } from "./agentAccess"
import {
  parseCreateCollection,
  parseCreateRecord,
  parseUpdateRecord,
} from "./lib/agentRequests"

const MAX_PAGE_SIZE = 50
const MAX_CURSOR_BYTES = 4096
const MAX_BODY_BYTES = 256 * 1024

// Auth is an explicit bearer token, never a cookie, so any origin may call.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
}

function reply(status: number, body: string) {
  return new Response(body, { status, headers: corsHeaders })
}

function replyJson(status: number, body: unknown) {
  return Response.json(body, { status, headers: corsHeaders })
}

/** Reads a JSON body of at most MAX_BODY_BYTES; undefined when it is not. */
async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

type WriteFailure = { status: "denied" | "invalid"; message: string }

/** Maps a refused write to 403 or 400 with the reason. */
function writeFailure({ status, message }: WriteFailure) {
  return replyJson(status === "denied" ? 403 : 400, { error: message })
}

type ReadRequest = {
  token: string
  collectionId: string
  cursor: string | null
  limit: number
}

/** Returns the Bearer credential, or null when the header is malformed. */
function bearerToken(request: Request) {
  return (
    /^Bearer ([a-f0-9]{64})$/.exec(
      request.headers.get("Authorization") ?? ""
    )?.[1] ?? null
  )
}

/** Parses `GET /agent/records` at the boundary, before any database read. */
function parseReadRequest(
  request: Request
): ReadRequest | "unauthorized" | "invalid" {
  const token = bearerToken(request)
  if (!token) return "unauthorized"
  const params = new URL(request.url).searchParams
  const ids = params.getAll("collectionId")
  const cursors = params.getAll("cursor")
  const limits = params.getAll("limit")
  if (ids.length !== 1 || cursors.length > 1 || limits.length > 1)
    return "invalid"
  const [collectionId] = ids
  const cursor = cursors[0] ?? null
  const rawLimit = limits[0] ?? String(MAX_PAGE_SIZE)
  const limit = Number(rawLimit)
  if (
    !collectionId ||
    !/^[0-9]+$/.test(rawLimit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE ||
    (cursor !== null &&
      new TextEncoder().encode(cursor).length > MAX_CURSOR_BYTES)
  )
    return "invalid"
  return { token, collectionId, cursor, limit }
}

const preflight = httpAction(
  async () => new Response(null, { status: 204, headers: corsHeaders })
)

const http = httpRouter()
http.route({ path: "/agent/workspace", method: "OPTIONS", handler: preflight })
http.route({
  path: "/agent/workspace",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request)
    if (!token) return reply(401, "Unauthorized")
    try {
      const result = await ctx.runQuery(internal.agentGrants.describe, {
        digest: await digestToken(token),
        now: Date.now(),
      })
      if (result === "denied") return reply(403, "Forbidden")
      return Response.json(result, { headers: corsHeaders })
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})
http.route({ path: "/agent/records", method: "OPTIONS", handler: preflight })
http.route({
  path: "/agent/records",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const parsed = parseReadRequest(request)
    if (parsed === "unauthorized") return reply(401, "Unauthorized")
    if (parsed === "invalid") return reply(400, "Invalid request")
    try {
      const result = await ctx.runQuery(internal.agentGrants.read, {
        digest: await digestToken(parsed.token),
        collectionId: parsed.collectionId,
        cursor: parsed.cursor,
        limit: parsed.limit,
        now: Date.now(),
      })
      if (result === "denied") return reply(403, "Forbidden")
      if (result === "invalid") return reply(400, "Invalid request")
      return Response.json(result, { headers: corsHeaders })
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})
http.route({
  path: "/agent/records",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request)
    if (!token) return reply(401, "Unauthorized")
    const body = parseCreateRecord(await readJson(request))
    if (!body)
      return replyJson(400, {
        error:
          "Send JSON: { collectionId, values, idempotencyKey? }. Values are text, numbers, or booleans.",
      })
    try {
      const result = await ctx.runMutation(internal.agentWrites.createRecord, {
        digest: await digestToken(token),
        ...body,
      })
      if (result.status === "denied" || result.status === "invalid")
        return writeFailure(result)
      return replyJson(result.status === "created" ? 201 : 200, result)
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})
http.route({
  path: "/agent/records",
  method: "PATCH",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request)
    if (!token) return reply(401, "Unauthorized")
    const body = parseUpdateRecord(await readJson(request))
    if (!body)
      return replyJson(400, {
        error:
          "Send JSON: { collectionId, recordId, expectedRevision, values }. expectedRevision is a positive integer.",
      })
    try {
      const result = await ctx.runMutation(internal.agentWrites.updateRecord, {
        digest: await digestToken(token),
        ...body,
      })
      if (result.status === "denied" || result.status === "invalid")
        return writeFailure(result)
      if (result.status === "conflict")
        return replyJson(409, {
          error: `The record changed. Its revision is now ${result.revision}. Read it again, then retry with that expectedRevision.`,
          revision: result.revision,
        })
      return replyJson(200, result)
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})
http.route({
  path: "/agent/collections",
  method: "OPTIONS",
  handler: preflight,
})
http.route({
  path: "/agent/collections",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request)
    if (!token) return reply(401, "Unauthorized")
    const body = parseCreateCollection(await readJson(request))
    if (!body)
      return replyJson(400, {
        error:
          'Send JSON: { name, fields: [{ id, label, type }] }. type is "text", "number", or "boolean".',
      })
    try {
      const result = await ctx.runMutation(
        internal.agentWrites.createCollection,
        { digest: await digestToken(token), ...body }
      )
      if (result.status !== "created") return writeFailure(result)
      return replyJson(201, result)
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})
export default http
