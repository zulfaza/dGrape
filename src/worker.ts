import server from "@tanstack/react-start/server-entry"
import { dispatchRecipes, type RecipeEnv } from "./recipe-workflow"
export { RecipeWorkflow } from "./recipe-workflow"
export default {
  fetch: server.fetch,
  async scheduled(_controller: ScheduledController, env: RecipeEnv) {
    await dispatchRecipes(env)
  },
}
