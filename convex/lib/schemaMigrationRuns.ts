import { v, type Infer } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"
import { recordAuditEvent, type AuditActor } from "./auditEvents"
import {
  fieldChangeValidator,
  fieldChanges,
  migratingMessage,
  rollbackLimitations,
  schemaMigrationFields,
} from "./schemaMigrations"

/**
 * Transaction-local migration operations that members (convex/schemaMigrations.ts)
 * and agent credentials (convex/agentMigrations.ts) share. Callers authorize
 * access to the collection first. The steps run in convex/schemaMigrations.ts.
 */

/** A migration as queries return it, with its derived report. */
export const migrationViewValidator = v.object({
  _id: v.id("schemaMigrations"),
  _creationTime: v.number(),
  ...schemaMigrationFields,
  changes: v.array(fieldChangeValidator),
  rollbackLimitations: v.array(v.string()),
  /** True when the active schema changed after the plan; plan again. */
  outdated: v.boolean(),
})

export function migrationView(
  migration: Doc<"schemaMigrations">,
  collection: Doc<"collections">
): Infer<typeof migrationViewValidator> {
  const changes = fieldChanges(migration.source.fields, migration.target.fields)
  return {
    ...migration,
    changes,
    rollbackLimitations: rollbackLimitations(changes),
    outdated: collection.definition.version !== migration.source.version,
  }
}

const outdatedMessage =
  "The collection schema changed after this plan; plan the migration again"

/**
 * Starts a dry run, or starts it again after a finished one. The dry run
 * does not lock the collection, so records can change while it runs.
 */
export async function startDryRun(
  ctx: MutationCtx,
  migration: Doc<"schemaMigrations">,
  collection: Doc<"collections">
) {
  if (collection.definition.version !== migration.source.version)
    throw new Error(outdatedMessage)
  if (migration.state.kind !== "planned" && migration.state.kind !== "checked")
    throw new Error(`A ${migration.state.kind} migration cannot dry run`)
  await ctx.db.patch(migration._id, {
    state: {
      kind: "dryRunning",
      after: null,
      checked: 0,
      misfitCount: 0,
      misfits: [],
    },
  })
  await ctx.scheduler.runAfter(0, internal.schemaMigrations.dryRunStep, {
    migrationId: migration._id,
    after: null,
  })
}

/**
 * Starts a migration whose dry run found no misfit: it locks the collection,
 * checks every record again, writes the target values, and then activates
 * the target definition. For a migration whose step stopped, it schedules
 * the step again from the stored cursor.
 */
export async function startMigration(
  ctx: MutationCtx,
  migration: Doc<"schemaMigrations">,
  collection: Doc<"collections">,
  actor: AuditActor
) {
  const migrationId = migration._id
  const { state } = migration
  const lockedByThis = collection.migrationLock?.migrationId === migrationId
  if (state.kind === "validating" && lockedByThis) {
    await ctx.scheduler.runAfter(0, internal.schemaMigrations.dryRunStep, {
      migrationId,
      after: state.after,
    })
    return
  }
  if (state.kind === "backfilling" && lockedByThis) {
    await ctx.db.patch(migrationId, { state: { ...state, error: null } })
    await ctx.scheduler.runAfter(0, internal.schemaMigrations.backfillStep, {
      migrationId,
      after: state.after,
    })
    return
  }
  if (state.kind !== "checked")
    throw new Error("Dry run the migration before it starts")
  if (state.misfitCount > 0)
    throw new Error(
      `${state.misfitCount} records do not fit the target schema; change them and dry run again`
    )
  if (collection.definition.version !== migration.source.version)
    throw new Error(outdatedMessage)
  if (collection.migrationLock)
    throw new Error(migratingMessage(collection.migrationLock))
  await ctx.db.patch(collection._id, {
    migrationLock: { migrationId, targetVersion: migration.target.version },
  })
  await ctx.db.patch(migrationId, {
    state: {
      kind: "validating",
      after: null,
      checked: 0,
      misfitCount: 0,
      misfits: [],
    },
  })
  await ctx.scheduler.runAfter(0, internal.schemaMigrations.dryRunStep, {
    migrationId,
    after: null,
  })
  await recordAuditEvent(ctx, collection.workspaceId, actor, {
    operation: "collection.startMigration",
    collectionId: collection._id,
    migrationId,
  })
}
