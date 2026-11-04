import { ConvexError, type Value } from "convex/values"
import { Result, Schema } from "effect"
import type { httpRouter } from "convex/server"
import { httpAction, type ActionCtx } from "../_generated/server"
import { digestToken } from "../agentAccess"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
}
const failure = Schema.Struct({
  status: Schema.Literals([400, 403, 409]),
  message: Schema.String,
})

/**
 * The status and reason of a refused operation: a ConvexError with
 * `{ status, message }`, as withGrant (convex/lib/agentGrant.ts) and runOnce
 * (convex/lib/operations.ts) throw it. Null for another ConvexError.
 */
export function agentFailure(error: ConvexError<Value>) {
  const decoded = Schema.decodeUnknownResult(failure)(error.data)
  return Result.isSuccess(decoded) ? decoded.success : null
}

/**
 * Registers `POST path` (and its CORS preflight) for an agent operation. The
 * body is JSON that decodes with `schema`; `operate` gets the credential
 * digest. A ConvexError with `{ status, message }` (see withGrant in
 * convex/lib/agentGrant.ts) becomes that status with `{ error: message }`.
 */
export function agentRoute<A, B>(
  router: ReturnType<typeof httpRouter>,
  path: string,
  schema: Schema.Codec<A, unknown>,
  operate: (ctx: ActionCtx, digest: string, input: A) => Promise<B>
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
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const token = /^Bearer ([a-f0-9]{64})$/.exec(
        request.headers.get("Authorization") ?? ""
      )?.[1]
      if (!token)
        return Response.json(
          { error: "Unauthorized" },
          { status: 401, headers }
        )
      const reader = request.body?.getReader()
      let text = ""
      let size = 0
      const decoder = new TextDecoder()
      if (reader)
        try {
          while (true) {
            const part = await reader.read()
            if (part.done) break
            size += part.value.byteLength
            if (size > 256 * 1024) {
              await reader.cancel()
              return Response.json(
                { error: "Body too large" },
                { status: 413, headers }
              )
            }
            text += decoder.decode(part.value, { stream: true })
          }
          text += decoder.decode()
        } finally {
          reader.releaseLock()
        }
      let body: A
      try {
        const decoded = Schema.decodeUnknownResult(schema)(JSON.parse(text))
        if (Result.isFailure(decoded))
          return Response.json(
            { error: "Invalid request" },
            { status: 400, headers }
          )
        body = decoded.success
      } catch {
        return Response.json(
          { error: "Invalid JSON" },
          { status: 400, headers }
        )
      }
      try {
        const result = await operate(ctx, await digestToken(token), body)
        return Response.json(result, { headers })
      } catch (error) {
        const refused =
          error instanceof ConvexError ? agentFailure(error) : null
        if (refused)
          return Response.json(
            { error: refused.message },
            { status: refused.status, headers }
          )
        return Response.json(
          { error: "Service unavailable" },
          { status: 503, headers }
        )
      }
    }),
  })
}
