import { httpRouter } from "convex/server"
import { httpAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { digestToken } from "./agentAccess"

export function registerRecipeRoutes(router: ReturnType<typeof httpRouter>) {
  router.route({
    pathPrefix: "/internal/recipes/",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const token = process.env.RECIPE_DISPATCH_TOKEN
      if (!token)
        return new Response("Runner is not configured", { status: 503 })
      const supplied = request.headers.get("Authorization") ?? ""
      if (
        (await digestToken(supplied)) !== (await digestToken(`Bearer ${token}`))
      )
        return new Response("Unauthorized", { status: 401 })
      const operation = new URL(request.url).pathname.slice(
        "/internal/recipes/".length
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
            if (size > 2048) {
              await reader.cancel()
              return new Response("Body too large", { status: 413 })
            }
            text += decoder.decode(part.value, { stream: true })
          }
          text += decoder.decode()
        } finally {
          reader.releaseLock()
        }
      const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      }
      try {
        const body: unknown = JSON.parse(text || "{}")
        if (!body || typeof body !== "object" || Array.isArray(body))
          return new Response("Invalid request", { status: 400 })
        if (operation === "dispatch")
          return new Response(
            JSON.stringify(
              await ctx.runMutation(internal.recipes.dispatch, {})
            ),
            { headers }
          )
        if (operation === "reconcile")
          return new Response(
            JSON.stringify(
              await ctx.runMutation(internal.recipeExecution.reconcile, {})
            ),
            { headers }
          )
        if (
          !("runId" in body) ||
          typeof body.runId !== "string" ||
          !("epoch" in body) ||
          typeof body.epoch !== "number" ||
          !Number.isSafeInteger(body.epoch)
        )
          return new Response("Invalid run", { status: 400 })
        const runId = await ctx.runQuery(internal.recipeExecution.resolveRun, {
          id: body.runId,
        })
        if (!runId) return new Response("Run not found", { status: 404 })
        const args = { runId, epoch: body.epoch }
        if (operation === "begin") {
          const run = await ctx.runMutation(internal.recipes.begin, args)
          const plan = run
            ? await ctx.runQuery(internal.recipeExecution.inspect, args)
            : null
          return new Response(
            JSON.stringify(
              plan
                ? {
                    steps: plan.recipe.steps.length,
                    attempts: plan.recipe.limits.attempts,
                  }
                : null
            ),
            { headers }
          )
        }
        if (operation === "fail") {
          await ctx.runMutation(internal.recipeExecution.finishFailed, args)
          return new Response("null", { headers })
        }
        if (
          operation === "step" &&
          "step" in body &&
          typeof body.step === "number" &&
          Number.isSafeInteger(body.step)
        ) {
          await ctx.runAction(internal.recipeRunner.execute, {
            ...args,
            step: body.step,
          })
          return new Response("null", { headers })
        }
        return new Response("Unknown operation", { status: 404 })
      } catch {
        return new Response("Recipe operation failed", { status: 500 })
      }
    }),
  })
}
