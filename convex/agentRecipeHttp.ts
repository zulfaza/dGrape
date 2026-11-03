import type { httpRouter } from "convex/server"
import { internal } from "./_generated/api"
import { agentRoute } from "./lib/agentRoute"
import * as Transport from "./lib/agentRecipeTransport"

export function registerAgentRecipeRoutes(
  router: ReturnType<typeof httpRouter>
) {
  agentRoute(
    router,
    "/agent/recipes/publish",
    Transport.PublishInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.publish, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/validate",
    Transport.ValidateInput,
    (ctx, digest, input) =>
      ctx.runQuery(internal.agentRecipes.validate, {
        ...input,
        digest,
        now: Date.now(),
      })
  )
  agentRoute(
    router,
    "/agent/recipes/preview",
    Transport.PreviewInput,
    (ctx, digest, input) =>
      ctx.runQuery(internal.agentRecipes.preview, {
        ...input,
        digest,
        now: Date.now(),
      })
  )
  agentRoute(
    router,
    "/agent/recipes/versions",
    Transport.PageInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.versions, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/runs",
    Transport.PageInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.runs, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/history",
    Transport.HistoryInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.history, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/trigger",
    Transport.TriggerInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.trigger, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/schedule",
    Transport.ScheduleInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.schedule, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/schedules",
    Transport.PageInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.schedules, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/setEnabled",
    Transport.EnabledInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.setEnabled, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/updateSchedule",
    Transport.UpdateScheduleInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.updateSchedule, {
        ...input,
        digest,
      })
  )
  route(
    router,
    "/agent/recipes/cancel",
    Transport.CancelInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.cancel, { ...input, digest })
  )
  agentRoute(
    router,
    "/agent/recipes/setRunAccess",
    Transport.AccessInput,
    (ctx, digest, input) =>
      ctx.runMutation(internal.agentRecipes.setRunAccess, { ...input, digest })
  )
}
