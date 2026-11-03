import { v, type Infer, type PropertyValidators } from "convex/values"
import type { Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { agentScopeValidator } from "./agentScope"

/**
 * Audit events: an append-only history of the changes in a workspace.
 *
 * An event holds only the actor, the operation, and the IDs, revisions and
 * flags of the changed objects. It never holds record values, secret values,
 * credential digests, names, or labels. Each operation has its own fields, so
 * an event cannot name an object that its operation does not change.
 */

/** The agent credential that made a change for its owner. */
export type AgentPrincipal = {
  grantId: Id<"agentGrants">
  owner: string
  registrationId: Id<"agentRegistrations"> | null
}

/** Who made a change: a signed-in user, or an agent credential. */
export const auditActorValidator = v.union(
  v.object({ kind: v.literal("user"), userId: v.string() }),
  v.object({
    kind: v.literal("agent"),
    grantId: v.id("agentGrants"),
    /** Null for a credential that a user created in the workspace settings. */
    registrationId: v.union(v.id("agentRegistrations"), v.null()),
    /** The user that the agent acts for. */
    owner: v.string(),
  })
)
export type AuditActor = Infer<typeof auditActorValidator>

const op = <Name extends string, Fields extends PropertyValidators>(
  name: Name,
  fields: Fields
) => v.object({ operation: v.literal(name), ...fields })

export const auditEventValidator = v.union(
  op("workspace.create", {}),
  op("collection.create", { collectionId: v.id("collections") }),
  op("collection.addField", {
    collectionId: v.id("collections"),
    version: v.number(),
  }),
  op("collection.renameField", {
    collectionId: v.id("collections"),
    version: v.number(),
  }),
  op("record.create", {
    collectionId: v.id("collections"),
    recordId: v.id("collectionRecords"),
  }),
  op("record.update", {
    collectionId: v.id("collections"),
    recordId: v.id("collectionRecords"),
    revision: v.number(),
  }),
  op("record.delete", {
    collectionId: v.id("collections"),
    recordId: v.id("collectionRecords"),
  }),
  op("query.save", { queryId: v.id("queryDefinitions"), revision: v.number() }),
  op("page.save", { pageId: v.id("pages"), revision: v.number() }),
  op("page.publish", { pageId: v.id("pages"), revision: v.number() }),
  op("recipe.publish", { versionId: v.id("recipeVersions") }),
  op("recipe.setRunAccess", {
    versionId: v.id("recipeVersions"),
    userId: v.string(),
    allowed: v.boolean(),
  }),
  op("schedule.create", {
    scheduleId: v.id("recipeSchedules"),
    versionId: v.id("recipeVersions"),
  }),
  op("schedule.setEnabled", {
    scheduleId: v.id("recipeSchedules"),
    enabled: v.boolean(),
  }),
  op("run.trigger", {
    runId: v.id("recipeRuns"),
    versionId: v.id("recipeVersions"),
  }),
  op("run.cancel", { runId: v.id("recipeRuns") }),
  op("connection.create", { connectionId: v.id("connections") }),
  op("connection.grantUse", {
    connectionId: v.id("connections"),
    userId: v.string(),
    allowed: v.boolean(),
    secretUse: v.boolean(),
  }),
  op("connection.remove", { connectionId: v.id("connections") }),
  op("secret.prepare", { secretId: v.id("secretRefs") }),
  op("secret.rotate", { secretId: v.id("secretRefs"), revision: v.number() }),
  op("secret.delete", { secretId: v.id("secretRefs") }),
  op("agentGrant.create", {
    grantId: v.id("agentGrants"),
    scope: agentScopeValidator,
  }),
  op("agentGrant.revoke", { grantId: v.id("agentGrants") }),
  op("agentRegistration.claim", {
    registrationId: v.id("agentRegistrations"),
    scope: agentScopeValidator,
  }),
  op("agentRegistration.revoke", {
    registrationId: v.id("agentRegistrations"),
  })
)
export type AuditEvent = Infer<typeof auditEventValidator>

export const auditEventFields = {
  workspaceId: v.id("workspaces"),
  actor: auditActorValidator,
  event: auditEventValidator,
}

/** The actor for a change that `userId` made, directly or through `agent`. */
export function auditActor(userId: string, agent?: AgentPrincipal): AuditActor {
  if (!agent) return { kind: "user", userId }
  return {
    kind: "agent",
    grantId: agent.grantId,
    registrationId: agent.registrationId,
    owner: agent.owner,
  }
}

/** Appends an event in the transaction of the change it describes. */
export async function recordAuditEvent(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  actor: AuditActor,
  event: AuditEvent
) {
  await ctx.db.insert("auditEvents", { workspaceId, actor, event })
}
