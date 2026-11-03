import type { httpRouter } from "convex/server"
import { internal } from "./_generated/api"
import { httpAction, type ActionCtx } from "./_generated/server"
import { digestToken } from "./agentAccess"
import { unauthorized } from "./agentIdentityHttp"

/**
 * Bearer-authenticated discovery reads for agents: capabilities, one
 * collection, and connections. Connection results carry no secret values.
 */

const MAX_PAGE_SIZE = 50
const MAX_CURSOR_BYTES = 4096

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
}

const fail = (status: number, error: string) =>
  Response.json({ error }, { status, headers })

/**
 * Parses the query string with `parse` (null when invalid), then answers with
 * `read`. "denied" becomes 403.
 */
function route<A, B>(
  router: ReturnType<typeof httpRouter>,
  path: string,
  usage: string,
  parse: (params: URLSearchParams) => A | null,
  read: (ctx: ActionCtx, digest: string, input: A) => Promise<B | "denied">
) {
  router.route({
    path,
    method: "OPTIONS",
    handler: httpAction(
      async () => new Response(null, { status: 204, headers })
    ),
  })
  router.route({
    path,
    method: "GET",
    handler: httpAction(async (ctx, request) => {
      const token = /^Bearer ([a-f0-9]{64})$/.exec(
        request.headers.get("Authorization") ?? ""
      )?.[1]
      if (!token) return unauthorized()
      const input = parse(new URL(request.url).searchParams)
      if (input === null) return fail(400, usage)
      try {
        const result = await read(ctx, await digestToken(token), input)
        if (result === "denied")
          return fail(
            403,
            "The credential is missing, expired, or revoked, or it cannot access this object."
          )
        return Response.json(result, { headers })
      } catch {
        return fail(503, "Service unavailable")
      }
    }),
  })
}

/** The one value of `name`, or null when it is absent, repeated, or empty. */
function single(params: URLSearchParams, name: string) {
  const values = params.getAll(name)
  return values.length === 1 && values[0] ? values[0] : null
}

function parsePage(params: URLSearchParams) {
  const cursors = params.getAll("cursor")
  const limits = params.getAll("limit")
  if (cursors.length > 1 || limits.length > 1) return null
  const cursor = cursors[0] ?? null
  const rawLimit = limits[0] ?? String(MAX_PAGE_SIZE)
  const limit = Number(rawLimit)
  if (
    !/^[0-9]+$/.test(rawLimit) ||
    limit < 1 ||
    limit > MAX_PAGE_SIZE ||
    (cursor !== null &&
      new TextEncoder().encode(cursor).length > MAX_CURSOR_BYTES)
  )
    return null
  return { cursor, limit }
}

export function registerAgentDiscoveryRoutes(
  router: ReturnType<typeof httpRouter>
) {
  route(
    router,
    "/agent/capabilities",
    "Send no parameters.",
    () => ({}),
    (ctx, digest) =>
      ctx.runQuery(internal.agentGrants.capabilities, {
        digest,
        now: Date.now(),
      })
  )
  route(
    router,
    "/agent/collections/describe",
    "Send one collectionId parameter.",
    (params) => {
      const collectionId = single(params, "collectionId")
      return collectionId === null ? null : { collectionId }
    },
    (ctx, digest, input) =>
      ctx.runQuery(internal.agentGrants.describeCollection, {
        digest,
        ...input,
        now: Date.now(),
      })
  )
  route(
    router,
    "/agent/connections",
    `Send limit (1 to ${MAX_PAGE_SIZE}) and cursor at most once each.`,
    parsePage,
    (ctx, digest, input) =>
      ctx.runQuery(internal.connectors.agentList, {
        digest,
        ...input,
        now: Date.now(),
      })
  )
  route(
    router,
    "/agent/connections/describe",
    "Send one connectionId parameter.",
    (params) => {
      const connectionId = single(params, "connectionId")
      return connectionId === null ? null : { connectionId }
    },
    (ctx, digest, input) =>
      ctx.runQuery(internal.connectors.agentDescribe, {
        digest,
        ...input,
        now: Date.now(),
      })
  )
}
