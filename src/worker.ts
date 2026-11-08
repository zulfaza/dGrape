import server from "@tanstack/react-start/server-entry"
import {
  SECRET_BINDING_PATH,
  type SecretBindingEnv,
} from "../convex/lib/secretBindings"
import { trackMcp, type McpAnalyticsEnv } from "./mcp-analytics"
import { dispatchRecipes, type RecipeEnv } from "./recipe-workflow"
import { resolveSecretBinding } from "./secret-bindings"
export { RecipeWorkflow } from "./recipe-workflow"
export default {
  async fetch(
    request: Request,
    env: SecretBindingEnv & McpAnalyticsEnv,
    ctx: ExecutionContext
  ) {
    const { pathname } = new URL(request.url)
    if (pathname === SECRET_BINDING_PATH)
      return resolveSecretBinding(request, env)
    if (pathname !== "/mcp" || env.POSTHOG_PROJECT_KEY === undefined)
      return server.fetch(request)
    const copy = request.clone()
    const start = performance.now()
    const response = await server.fetch(request)
    ctx.waitUntil(
      trackMcp(env, copy, response.clone(), performance.now() - start)
    )
    return response
  },
  async scheduled(_controller: ScheduledController, env: RecipeEnv) {
    await dispatchRecipes(env)
  },
}
