import { v, type Infer } from "convex/values"
import type { AgentScope } from "./agentScope"

/**
 * The operation groups that an agent credential can use. `read` groups work
 * with every credential; `write` groups need a read-and-write credential.
 * Some operations also need a per-object grant, which the description gives.
 */
const CAPABILITIES = [
  {
    id: "workspace.read",
    access: "read",
    description: "Describe the workspace and list its collections.",
  },
  {
    id: "collections.read",
    access: "read",
    description: "Describe one collection, its fields, and schema version.",
  },
  {
    id: "collections.write",
    access: "write",
    description: "Create collections and add fields.",
  },
  {
    id: "records.read",
    access: "read",
    description: "List records and query them by an indexed field.",
  },
  {
    id: "records.write",
    access: "write",
    description: "Create, update, and delete records.",
  },
  {
    id: "artifacts.read",
    access: "read",
    description: "List artifacts and get signed download URLs.",
  },
  {
    id: "artifacts.write",
    access: "write",
    description: "Upload artifacts.",
  },
  {
    id: "connections.read",
    access: "read",
    description:
      "List and describe the connections that the credential owner can use. Secret values are never returned.",
  },
  {
    id: "recipes.read",
    access: "read",
    description: "List recipe versions, runs, run history, and schedules.",
  },
  {
    id: "recipes.write",
    access: "write",
    description:
      "Publish and start recipes, and cancel runs. Starting or cancelling needs run permission on the recipe.",
  },
  {
    id: "schedules.write",
    access: "write",
    description:
      "Create, enable, and disable schedules, and grant run permission. Only the recipe creator can do this.",
  },
] as const

export const capabilityValidator = v.object({
  id: v.string(),
  access: v.union(v.literal("read"), v.literal("write")),
  allowed: v.boolean(),
  description: v.string(),
})

/** Each capability, marked with whether a credential of `scope` may use it. */
export function capabilitiesFor(
  scope: AgentScope
): Infer<typeof capabilityValidator>[] {
  return CAPABILITIES.map((capability) => ({
    ...capability,
    allowed: capability.access === "read" || scope === "readwrite",
  }))
}
