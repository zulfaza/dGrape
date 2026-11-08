import server from "@tanstack/react-start/server-entry"
import {
  SECRET_BINDING_PATH,
  type SecretBindingEnv,
} from "../convex/lib/secretBindings"
import { dispatchRecipes, type RecipeEnv } from "./recipe-workflow"
import { resolveSecretBinding } from "./secret-bindings"
export { RecipeWorkflow } from "./recipe-workflow"
export default {
  async fetch(request: Request, env: SecretBindingEnv) {
    if (new URL(request.url).pathname === SECRET_BINDING_PATH)
      return resolveSecretBinding(request, env)
    return server.fetch(request)
  },
  async scheduled(_controller: ScheduledController, env: RecipeEnv) {
    await dispatchRecipes(env)
  },
}
