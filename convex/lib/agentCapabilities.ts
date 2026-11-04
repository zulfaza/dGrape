import { v, type Infer } from "convex/values"
import {
  agentScopeValidator,
  missingScopes,
  type AgentScope,
} from "./agentScope"

/**
 * The operation groups that an agent credential can use, each with the
 * scopes it needs. Some operations also need a per-object grant, which the
 * description gives.
 */
const CAPABILITIES = [
  {
    id: "workspace.read",
    scopes: ["data.read"],
    description: "Describe the workspace and list its collections.",
  },
  {
    id: "collections.read",
    scopes: ["data.read"],
    description: "Describe one collection, its fields, and schema version.",
  },
  {
    id: "collections.write",
    scopes: ["data.write"],
    description: "Create collections, add fields, and rename field labels.",
  },
  {
    id: "records.read",
    scopes: ["data.read"],
    description: "List records and query them by an indexed field.",
  },
  {
    id: "records.write",
    scopes: ["data.write"],
    description: "Create, update, and delete records.",
  },
  {
    id: "artifacts.read",
    scopes: ["artifacts.read"],
    description: "List artifacts and get signed download URLs.",
  },
  {
    id: "artifacts.write",
    scopes: ["artifacts.write"],
    description: "Upload artifacts.",
  },
  {
    id: "connections.read",
    scopes: ["jobs.read"],
    description:
      "List and describe the connections that the credential owner can use. Secret values are never returned.",
  },
  {
    id: "recipes.read",
    scopes: ["jobs.read"],
    description: "List recipe versions, runs, run history, and schedules.",
  },
  {
    id: "recipes.publish",
    scopes: ["jobs.manage"],
    description:
      "Publish recipes. A recipe with a fetch step also needs connections.use.",
  },
  {
    id: "recipes.run",
    scopes: ["jobs.run"],
    description:
      "Start, retry, and cancel recipe runs. This needs run permission on the recipe, and connections.use for a recipe with a fetch step.",
  },
  {
    id: "queries.read",
    scopes: ["data.read"],
    description:
      "List saved queries with their result fields, and run a saved query revision.",
  },
  {
    id: "queries.write",
    scopes: ["data.write"],
    description: "Save records queries as new immutable revisions.",
  },
  {
    id: "pages.read",
    scopes: ["pages.read"],
    description:
      "List pages and get a page version with the problems of its query bindings.",
  },
  {
    id: "pages.write",
    scopes: ["pages.write"],
    description: "Save page drafts, and publish or roll back pages.",
  },
  {
    id: "activity.read",
    scopes: [],
    description:
      "Read the activity history, newest first. Each event shows only when the credential has the read scope of the changed object: data.read, pages.read, or jobs.read. Credential events show only in the dashboard.",
  },
  {
    id: "schedules.write",
    scopes: ["jobs.manage"],
    description:
      "Create, change, enable, and disable schedules, and grant run permission. Only the recipe creator can do this. A recipe with a fetch step also needs connections.use.",
  },
] as const satisfies ReadonlyArray<{
  id: string
  scopes: ReadonlyArray<AgentScope>
  description: string
}>

export const capabilityValidator = v.object({
  id: v.string(),
  scopes: v.array(agentScopeValidator),
  allowed: v.boolean(),
  description: v.string(),
})

/** Each capability, marked with whether a credential with `scopes` may use it. */
export function capabilitiesFor(
  scopes: ReadonlyArray<AgentScope>
): Infer<typeof capabilityValidator>[] {
  return CAPABILITIES.map((capability) => ({
    ...capability,
    scopes: [...capability.scopes],
    allowed: missingScopes(scopes, capability.scopes).length === 0,
  }))
}
