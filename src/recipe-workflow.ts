/// <reference types="@cloudflare/workers-types" />
import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  type WorkflowStep,
} from "cloudflare:workers"

export interface RecipeEnv {
  RECIPE_CONVEX_SITE_URL: string
  RECIPE_DISPATCH_TOKEN: string
  RECIPE_WORKFLOW: Workflow<{ runId: string; epoch: number }>
}
async function bridge(
  env: RecipeEnv,
  operation: string,
  body: object
): Promise<unknown> {
  const url = new URL(env.RECIPE_CONVEX_SITE_URL)
  if (
    url.protocol !== "https:" &&
    !(
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    )
  )
    throw new Error("Invalid recipe backend")
  const response = await fetch(new URL(`/internal/recipes/${operation}`, url), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RECIPE_DISPATCH_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  })
  if (!response.ok) throw new Error("Recipe operation failed")
  return response.json()
}
function claims(
  value: unknown
): { runId: string; epoch: number; timedOut: boolean }[] {
  if (!Array.isArray(value)) throw new Error("Invalid runner response")
  return value.map((item: unknown) => {
    if (
      !item ||
      typeof item !== "object" ||
      !("epoch" in item) ||
      typeof item.epoch !== "number"
    )
      throw new Error("Invalid runner claim")
    const runId = "runId" in item ? item.runId : "_id" in item ? item._id : null
    if (typeof runId !== "string") throw new Error("Invalid runner claim")
    return {
      runId,
      epoch: item.epoch,
      timedOut: "timedOut" in item && item.timedOut === true,
    }
  })
}
export function workflowId(run: { runId: string; epoch: number }) {
  return `recipe-${run.runId}-${run.epoch}`
}
/** One dispatcher owns both lease repair and scheduled/manual delivery. */
export async function dispatchRecipes(env: RecipeEnv) {
  for (const run of claims(await bridge(env, "reconcile", {}))) {
    try {
      const instance = await env.RECIPE_WORKFLOW.get(workflowId(run))
      const status = await instance.status()
      if (run.timedOut) {
        await instance.terminate()
        await bridge(env, "fail", run)
      } else if (["errored", "terminated", "complete"].includes(status.status))
        await bridge(env, "fail", run)
    } catch {
      if (run.timedOut) await bridge(env, "fail", run)
    }
  }
  for (const run of claims(await bridge(env, "dispatch", {}))) {
    const id = workflowId(run)
    try {
      await env.RECIPE_WORKFLOW.create({
        id,
        params: { runId: run.runId, epoch: run.epoch },
      })
    } catch {
      // A create may have succeeded before its response was lost. Never finalize on transport uncertainty.
      try {
        await env.RECIPE_WORKFLOW.get(id)
      } catch {
        /* Expired launch leases are reclaimed on the next tick. */
      }
    }
  }
}
export class RecipeWorkflow extends WorkflowEntrypoint<
  RecipeEnv,
  { runId: string; epoch: number }
> {
  async run(
    event: WorkflowEvent<{ runId: string; epoch: number }>,
    step: WorkflowStep
  ) {
    const args = event.payload
    try {
      const plan = await step.do(
        "begin",
        { retries: { limit: 2, delay: "2 seconds" }, timeout: "30 seconds" },
        async () => {
          const value = await bridge(this.env, "begin", args)
          if (value === null) return null
          if (
            typeof value !== "object" ||
            !("steps" in value) ||
            typeof value.steps !== "number" ||
            !("attempts" in value) ||
            typeof value.attempts !== "number"
          )
            throw new Error("Invalid runner plan")
          return { steps: value.steps, attempts: value.attempts }
        }
      )
      if (plan === null) return
      if (
        typeof plan !== "object" ||
        !("steps" in plan) ||
        typeof plan.steps !== "number" ||
        !("attempts" in plan) ||
        typeof plan.attempts !== "number"
      )
        throw new Error("Invalid runner plan")
      for (let index = 0; index < plan.steps; index++) {
        await step.do(
          `step-${index}`,
          {
            retries: {
              limit: plan.attempts - 1,
              delay: "2 seconds",
              backoff: "exponential",
            },
            timeout: "90 seconds",
          },
          async () => {
            await bridge(this.env, "step", { ...args, step: index })
            return null
          }
        )
      }
    } catch {
      await step.do("record-failure", async () => {
        await bridge(this.env, "fail", args)
        return null
      })
      throw new Error("Recipe run failed")
    }
  }
}
