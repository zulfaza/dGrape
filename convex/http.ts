import { registerAgentDiscoveryRoutes } from "./agentDiscoveryHttp"
import { registerAgentRecipeRoutes } from "./agentRecipeHttp"
import { collectionTemplates } from "./lib/collectionTemplates"
import { registerRecipeRoutes } from "./recipeHttp"
import { agentRoute } from "./lib/agentRoute"
import * as Pages from "./lib/agentPageTransport"
import * as Queries from "./lib/agentQueryTransport"
import { httpRouter } from "convex/server"
import type { Id } from "./_generated/dataModel"
import { httpAction, type ActionCtx } from "./_generated/server"
import { downloadUrl } from "./artifacts"
import {
  missingScopeMessage,
  missingScopes,
  type AgentScope,
} from "./lib/agentScope"
import { DOWNLOAD_URL_SECONDS } from "./lib/artifactDomain"
import { internal } from "./_generated/api"
import { digestToken } from "./agentAccess"
import {
  authorizationServer,
  jwks,
  newClaim as newAgentClaim,
  protectedResource,
  skill,
  unauthorized,
  register as registerAgent,
  revoke as revokeAgentToken,
  token as agentToken,
} from "./agentIdentityHttp"
import {
  parseAddField,
  parseCreateCollection,
  parseCreateRecord,
  parseDeleteRecord,
  parseQueryRecords,
  parseUpdateRecord,
} from "./lib/agentRequests"

import { save as saveSecret, options as secretOptions } from "./secretSettings"

const MAX_PAGE_SIZE = 50
const MAX_CURSOR_BYTES = 4096
const MAX_BODY_BYTES = 256 * 1024

// Auth is an explicit bearer token, never a cookie, so any origin may call.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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
http.route({ path: "/settings/secrets", method: "POST", handler: saveSecret })
http.route({
  path: "/settings/secrets",
  method: "OPTIONS",
  handler: secretOptions,
})
// The catalog is public metadata. Creation still requires workspace write access.
http.route({
  path: "/agent/collections/templates",
  method: "OPTIONS",
  handler: preflight,
})
http.route({
  path: "/agent/collections/templates",
  method: "GET",
  handler: httpAction(async () =>
    Response.json(collectionTemplates(), { headers: corsHeaders })
  ),
})
registerRecipeRoutes(http)
registerAgentRecipeRoutes(http)
agentRoute(
  http,
  "/agent/queries/save",
  Queries.SaveInput,
  (ctx, digest, input) =>
    ctx.runMutation(internal.agentQueries.save, {
      ...input,
      query: Queries.toRecordQuery(input.query),
      digest,
    })
)
agentRoute(
  http,
  "/agent/queries/list",
  Queries.ListInput,
  (ctx, digest, input) =>
    ctx.runQuery(internal.agentQueries.list, {
      digest,
      now: Date.now(),
      numItems: input.limit ?? Queries.MAX_PAGE_SIZE,
      cursor: input.cursor ?? null,
    })
)
agentRoute(http, "/agent/queries/run", Queries.RunInput, (ctx, digest, input) =>
  ctx.runQuery(internal.agentQueries.run, {
    digest,
    now: Date.now(),
    queryId: input.queryId,
    revision: input.revision,
    numItems: input.limit ?? Queries.MAX_PAGE_SIZE,
    cursor: input.cursor ?? null,
  })
)
registerAgentDiscoveryRoutes(http)
agentRoute(
  http,
  "/agent/pages/saveDraft",
  Pages.SaveDraftInput,
  (ctx, digest, input) =>
    ctx.runMutation(internal.agentPages.saveDraft, { ...input, digest })
)
agentRoute(
  http,
  "/agent/pages/publish",
  Pages.PublishInput,
  (ctx, digest, input) =>
    ctx.runMutation(internal.agentPages.publish, { ...input, digest })
)
agentRoute(http, "/agent/pages/get", Pages.GetInput, (ctx, digest, input) =>
  ctx.runQuery(internal.agentPages.get, { ...input, digest, now: Date.now() })
)
agentRoute(http, "/agent/pages/list", Pages.ListInput, (ctx, digest, input) =>
  ctx.runQuery(internal.agentPages.list, {
    digest,
    now: Date.now(),
    numItems: input.limit ?? Pages.MAX_PAGE_SIZE,
    cursor: input.cursor ?? null,
  })
)
http.route({ path: "/agent/workspace", method: "OPTIONS", handler: preflight })
http.route({
  path: "/agent/workspace",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request)
    if (!token) return unauthorized()
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
    if (parsed === "unauthorized") return unauthorized()
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
    if (!token) return unauthorized()
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
    if (!token) return unauthorized()
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
  path: "/agent/records",
  method: "DELETE",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request)
    if (!token) return unauthorized()
    const body = parseDeleteRecord(await readJson(request))
    if (!body)
      return replyJson(400, {
        error:
          "Send JSON: { collectionId, recordId, expectedRevision }. expectedRevision is a positive integer.",
      })
    try {
      const result = await ctx.runMutation(internal.agentWrites.deleteRecord, {
        digest: await digestToken(token),
        ...body,
      })
      if (result.status === "denied") return writeFailure(result)
      if (result.status === "conflict")
        return replyJson(409, {
          error: `The record changed. Its revision is now ${result.revision}. Read it again before you delete it.`,
          revision: result.revision,
        })
      return replyJson(200, result)
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})
http.route({
  path: "/agent/records/query",
  method: "OPTIONS",
  handler: preflight,
})
http.route({
  path: "/agent/records/query",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request)
    if (!token) return unauthorized()
    const body = parseQueryRecords(
      await readJson(request),
      MAX_PAGE_SIZE,
      MAX_CURSOR_BYTES
    )
    if (!body)
      return replyJson(400, {
        error: `Send JSON: { collectionId, fieldId, order?: "asc" | "desc", where?: { eq } | { lower?, upper? }, limit?: 1 to ${MAX_PAGE_SIZE}, cursor? }. A bound is { value, inclusive? }.`,
      })
    try {
      const result = await ctx.runQuery(internal.agentGrants.queryPage, {
        digest: await digestToken(token),
        collectionId: body.collectionId,
        query: body.query,
        cursor: body.cursor,
        limit: body.limit,
        now: Date.now(),
      })
      if (result.status === "denied") return reply(403, "Forbidden")
      if (result.status === "invalid")
        return replyJson(400, { error: result.message })
      return Response.json(result.result, { headers: corsHeaders })
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
    if (!token) return unauthorized()
    const body = parseCreateCollection(await readJson(request))
    if (!body)
      return replyJson(400, {
        error:
          'Send JSON: { name, fields: [{ id, label, type }] }. type is "text", "number", "boolean", "integer", "currency", "timestamp" (integer milliseconds since the epoch), "date" (YYYY-MM-DD), "select", or "multiSelect". Select and multiSelect fields need options: an array of 1 to 100 texts.',
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
http.route({
  path: "/agent/collections/fields",
  method: "OPTIONS",
  handler: preflight,
})
http.route({
  path: "/agent/collections/fields",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const token = bearerToken(request)
    if (!token) return unauthorized()
    const body = parseAddField(await readJson(request))
    if (!body)
      return replyJson(400, {
        error:
          'Send JSON: { collectionId, field: { id, label, type } }. type is "text", "number", "boolean", "integer", "currency", "timestamp" (integer milliseconds since the epoch), "date" (YYYY-MM-DD), "select", or "multiSelect". Select and multiSelect fields need options: an array of 1 to 100 texts.',
      })
    try {
      const result = await ctx.runMutation(internal.agentWrites.addField, {
        digest: await digestToken(token),
        ...body,
      })
      if (result.status !== "added") return writeFailure(result)
      return replyJson(201, result)
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})
http.route({ path: "/agent/identity", method: "OPTIONS", handler: preflight })
http.route({ path: "/agent/identity", method: "POST", handler: registerAgent })
http.route({
  path: "/agent/identity/claim",
  method: "OPTIONS",
  handler: preflight,
})
http.route({
  path: "/agent/identity/claim",
  method: "POST",
  handler: newAgentClaim,
})
http.route({ path: "/oauth2/token", method: "OPTIONS", handler: preflight })
http.route({ path: "/oauth2/token", method: "POST", handler: agentToken })
http.route({ path: "/oauth2/revoke", method: "OPTIONS", handler: preflight })
http.route({
  path: "/oauth2/revoke",
  method: "POST",
  handler: revokeAgentToken,
})
http.route({ path: "/.well-known/jwks.json", method: "GET", handler: jwks })
http.route({
  path: "/.well-known/oauth-authorization-server",
  method: "GET",
  handler: authorizationServer,
})
http.route({
  path: "/.well-known/oauth-protected-resource",
  method: "GET",
  handler: protectedResource,
})
http.route({ path: "/auth.md", method: "GET", handler: skill })
type Credential = {
  grantId: Id<"agentGrants">
  workspaceId: Id<"workspaces">
}

/** Resolves the Bearer credential, or returns the 401/403 response. */
async function credential(
  ctx: ActionCtx,
  request: Request,
  needs: ReadonlyArray<AgentScope>
): Promise<Credential | Response> {
  const token = bearerToken(request)
  if (!token) return unauthorized()
  const grant = await ctx.runQuery(internal.agentGrants.resolve, {
    digest: await digestToken(token),
    now: Date.now(),
  })
  if (!grant) return reply(403, "Forbidden")
  const missing = missingScopes(grant.scopes, needs)
  if (missing.length > 0)
    return replyJson(403, { error: missingScopeMessage(missing) })
  return { grantId: grant.grantId, workspaceId: grant.workspaceId }
}

/** Public artifact fields; the R2 key stays internal. */
function artifactJson(artifact: {
  _id: string
  _creationTime: number
  name: string
  contentType: string
  size: number
}) {
  return {
    id: artifact._id,
    name: artifact.name,
    contentType: artifact.contentType,
    size: artifact.size,
    createdAt: new Date(artifact._creationTime).toISOString(),
  }
}

for (const path of [
  "/agent/artifacts",
  "/agent/artifacts/uploads",
  "/agent/artifacts/download",
])
  http.route({ path, method: "OPTIONS", handler: preflight })

http.route({
  path: "/agent/artifacts/uploads",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const grant = await credential(ctx, request, ["artifacts.write"])
      if (grant instanceof Response) return grant
      const body = await readJson(request)
      if (
        typeof body !== "object" ||
        body === null ||
        !("name" in body) ||
        typeof body.name !== "string"
      )
        return replyJson(400, { error: "Send JSON: { name }." })
      const result = await ctx.runMutation(internal.artifacts.insertUpload, {
        workspaceId: grant.workspaceId,
        name: body.name,
        createdBy: { kind: "agent", grantId: grant.grantId },
        now: Date.now(),
      })
      if (result.status === "invalid")
        return replyJson(400, { error: result.message })
      return replyJson(201, {
        uploadId: result.key,
        uploadUrl: result.url,
        expiresAt: new Date(result.expiresAt).toISOString(),
        next: "PUT the file bytes to uploadUrl with a Content-Type header, then POST { uploadId } to /agent/artifacts.",
      })
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})

http.route({
  path: "/agent/artifacts",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const grant = await credential(ctx, request, ["artifacts.write"])
      if (grant instanceof Response) return grant
      const body = await readJson(request)
      if (
        typeof body !== "object" ||
        body === null ||
        !("uploadId" in body) ||
        typeof body.uploadId !== "string"
      )
        return replyJson(400, { error: "Send JSON: { uploadId }." })
      const result = await ctx.runAction(
        internal.artifacts.completeUploadForWorkspace,
        { workspaceId: grant.workspaceId, key: body.uploadId }
      )
      if (result.status === "invalid")
        return replyJson(400, { error: result.message })
      return replyJson(201, { id: result.artifactId })
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})

http.route({
  path: "/agent/artifacts",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const grant = await credential(ctx, request, ["artifacts.read"])
      if (grant instanceof Response) return grant
      const params = new URL(request.url).searchParams
      const cursor = params.get("cursor")
      const limit = Number(params.get("limit") ?? MAX_PAGE_SIZE)
      if (
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > MAX_PAGE_SIZE ||
        (cursor !== null &&
          new TextEncoder().encode(cursor).length > MAX_CURSOR_BYTES)
      )
        return reply(400, "Invalid request")
      const page = await ctx.runQuery(internal.artifacts.listForWorkspace, {
        workspaceId: grant.workspaceId,
        cursor,
        limit,
      })
      return replyJson(200, {
        page: page.page.map(artifactJson),
        isDone: page.isDone,
        continueCursor: page.continueCursor,
      })
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})

http.route({
  path: "/agent/artifacts/download",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    try {
      const grant = await credential(ctx, request, ["artifacts.read"])
      if (grant instanceof Response) return grant
      const artifactId = new URL(request.url).searchParams.get("artifactId")
      if (!artifactId) return reply(400, "Invalid request")
      const artifact = await ctx.runQuery(internal.artifacts.getArtifact, {
        artifactId,
      })
      if (!artifact || artifact.workspaceId !== grant.workspaceId)
        return reply(403, "Forbidden")
      return replyJson(200, {
        ...artifactJson(artifact),
        url: await downloadUrl(artifact.key),
        expiresInSeconds: DOWNLOAD_URL_SECONDS,
      })
    } catch {
      return reply(503, "Service unavailable")
    }
  }),
})

export default http
