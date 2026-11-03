import { v, type Infer } from "convex/values"

/**
 * Agent scopes. A credential holds a set of scopes for one workspace. No
 * scope implies another: a write scope does not include its read scope.
 * Each agent route names the scopes it needs.
 */
export const agentScopeValidator = v.union(
  v.literal("data.read"),
  v.literal("data.write"),
  v.literal("artifacts.read"),
  v.literal("artifacts.write"),
  v.literal("pages.read"),
  v.literal("pages.write"),
  v.literal("jobs.read"),
  v.literal("jobs.run"),
  v.literal("jobs.manage"),
  v.literal("connections.use"),
  v.literal("connections.manage")
)

export type AgentScope = Infer<typeof agentScopeValidator>

/**
 * The scopes that some agent route checks. Discovery documents and consent
 * screens offer only these. Add a scope here when its first route exists.
 */
export const OFFERED_SCOPES = [
  "data.read",
  "data.write",
  "artifacts.read",
  "artifacts.write",
  "pages.read",
  "pages.write",
  "jobs.read",
  "jobs.run",
  "jobs.manage",
  "connections.use",
] as const satisfies ReadonlyArray<AgentScope>

export const SCOPE_DESCRIPTIONS: Record<AgentScope, string> = {
  "data.read": "Read collections and records.",
  "data.write": "Create collections, and create, change, and delete records.",
  "artifacts.read": "List and download artifacts.",
  "artifacts.write": "Upload artifacts.",
  "pages.read": "Read pages and their revisions.",
  "pages.write": "Save page drafts, and publish or roll back pages.",
  "jobs.read": "Read recipe versions, runs, run history, and schedules.",
  "jobs.run": "Start, retry, and cancel recipe runs.",
  "jobs.manage": "Publish recipes and manage schedules and run access.",
  "connections.use":
    "Let recipes call connections. Never shows connection secrets.",
  "connections.manage": "Configure connections.",
}

/** Grants made before fine-grained scopes. Stored rows can still hold them. */
const legacyScopeValidator = v.union(
  v.literal("readonly"),
  v.literal("readwrite")
)

/**
 * The exact access that each legacy grant had. Consent screens offer the
 * same sets as presets. Do not add scopes here: that gives old grants access
 * that their user did not approve.
 */
export const SCOPE_PRESETS = {
  readonly: ["data.read", "artifacts.read", "pages.read", "jobs.read"],
  readwrite: [
    "data.read",
    "data.write",
    "artifacts.read",
    "artifacts.write",
    "pages.read",
    "pages.write",
    "jobs.read",
    "jobs.run",
    "jobs.manage",
    "connections.use",
  ],
} as const satisfies Record<
  Infer<typeof legacyScopeValidator>,
  ReadonlyArray<AgentScope>
>

/** The scopes as stored on a grant or registration: a legacy name or a set. */
export const storedScopesValidator = v.union(
  legacyScopeValidator,
  v.array(agentScopeValidator)
)

export type StoredScopes = Infer<typeof storedScopesValidator>

/** Expands stored scopes to the scopes that they grant. */
export function grantedScopes(stored: StoredScopes): ReadonlyArray<AgentScope> {
  return Array.isArray(stored) ? stored : SCOPE_PRESETS[stored]
}

/**
 * Parses scopes chosen on a consent screen: at least one, each offered, no
 * duplicates, in the canonical order. Returns null when the set is invalid.
 */
export function parseRequestedScopes(
  scopes: ReadonlyArray<AgentScope>
): Array<AgentScope> | null {
  const chosen = new Set(scopes)
  if (chosen.size === 0 || chosen.size !== scopes.length) return null
  const ordered = OFFERED_SCOPES.filter((scope) => chosen.has(scope))
  return ordered.length === chosen.size ? ordered : null
}

/** The needed scopes that `granted` does not hold. */
export function missingScopes(
  granted: ReadonlyArray<AgentScope>,
  needs: ReadonlyArray<AgentScope>
): Array<AgentScope> {
  return needs.filter((scope) => !granted.includes(scope))
}

/** The 403 message for a credential that lacks `missing`. */
export function missingScopeMessage(missing: ReadonlyArray<AgentScope>) {
  return `This credential does not have the scope ${missing.join(", ")}. Ask the user for a credential with it.`
}
