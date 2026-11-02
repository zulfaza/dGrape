import { v, type Infer } from "convex/values"

/** What an agent credential may do in its workspace. */
export const agentScopeValidator = v.union(
  v.literal("readonly"),
  v.literal("readwrite")
)

export type AgentScope = Infer<typeof agentScopeValidator>
