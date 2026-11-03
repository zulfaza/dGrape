import { ConvexError } from "convex/values"
import { Result, Schema } from "effect"
import { httpRouter } from "convex/server"
import { httpAction, type ActionCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { digestToken } from "./agentAccess"
import * as Transport from "./lib/agentRecipeTransport"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store",
}
const failure = Schema.Struct({
  status: Schema.Literals([400, 403]),
  message: Schema.String,
})

function route<A, B>(
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
        if (error instanceof ConvexError) {
          const decoded = Schema.decodeUnknownResult(failure)(error.data)
          if (Result.isSuccess(decoded))
            return Response.json(
              { error: decoded.success.message },
              { status: decoded.success.status, headers }
            )
        }
        return Response.json(
          { error: "Service unavailable" },
          { status: 503, headers }
        )
      }
    }),
  })
}
export function registerAgentRecipeRoutes(
  router: ReturnType<typeof httpRouter>
) {
  route(
    router,
    "/agent/recipes/publish",
    Transport.PublishInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.publish, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/versions",
    Transport.PageInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.versions, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/runs",
    Transport.PageInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.runs, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/history",
    Transport.HistoryInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.history, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/trigger",
    Transport.TriggerInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.trigger, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/schedule",
    Transport.ScheduleInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.schedule, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/schedules",
    Transport.PageInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.schedules, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/setEnabled",
    Transport.EnabledInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.setEnabled, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/cancel",
    Transport.CancelInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.cancel, { ...input, digest })
  )
  route(
    router,
    "/agent/recipes/setRunAccess",
    Transport.AccessInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.setRunAccess, { ...input, digest })
  )
}
