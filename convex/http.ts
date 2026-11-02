import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { digestToken } from "./agentAccess"

const MAX_PAGE_SIZE = 50
const MAX_CURSOR_BYTES = 4096

// Auth is an explicit bearer token, never a cookie, so any origin may call.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization",
}

function reply(status: number, body: string) {
  return new Response(body, { status, headers: corsHeaders })
}

type ReadRequest = {
  token: string
  collectionId: string
  cursor: string | null
  limit: number
}

/** Parses `GET /agent/records` at the boundary, before any database read. */
function parseReadRequest(
  request: Request
): ReadRequest | "unauthorized" | "invalid" {
  const token = /^Bearer ([a-f0-9]{64})$/.exec(
    request.headers.get("Authorization") ?? ""
  )?.[1]
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

const http = httpRouter()
http.route({
  path: "/agent/records",
  method: "OPTIONS",
  handler: httpAction(
    async () => new Response(null, { status: 204, headers: corsHeaders })
  ),
})
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
export default http
