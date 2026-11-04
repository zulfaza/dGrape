import { v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  type QueryCtx,
} from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import { auditActor, recordAuditEvent } from "./lib/auditEvents"
import {
  agentFieldValidator,
  recordValuesValidator,
} from "./lib/collectionDomain"
import { planMigration } from "./lib/collectionSchemas"
import {
  migrationView,
  migrationViewValidator,
  startDryRun,
  startMigration,
} from "./lib/schemaMigrationRuns"

/**
 * Schema migration operations for agent credentials. convex/http.ts calls
 * these after it decodes the request with
 * convex/lib/agentMigrationTransport.ts. The credential check and the
 * operation share one transaction (withGrant).
 */

/** A migration of a collection in `workspaceId`, and that collection. */
async function migrationInWorkspace(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  rawMigrationId: string
) {
  const migrationId = ctx.db.normalizeId("schemaMigrations", rawMigrationId)
  const migration = migrationId && (await ctx.db.get(migrationId))
  const collection = migration && (await ctx.db.get(migration.collectionId))
  if (!migration || !collection || collection.workspaceId !== workspaceId)
    throw new Error("Migration access denied")
  return { migration, collection }
}

export const plan = internalMutation({
  args: {
    digest: v.string(),
    collectionId: v.string(),
    expectedVersion: v.number(),
    fields: v.array(agentFieldValidator),
    defaults: v.optional(recordValuesValidator),
  },
  returns: v.object({ migrationId: v.id("schemaMigrations") }),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["data.write"], async (grant) => {
      const collectionId = ctx.db.normalizeId("collections", args.collectionId)
      const collection = collectionId && (await ctx.db.get(collectionId))
      if (!collection || collection.workspaceId !== grant.workspaceId)
        throw new Error("Collection access denied")
      const migrationId = await planMigration(ctx, collection, {
        expectedVersion: args.expectedVersion,
        fields: args.fields,
        defaults: args.defaults ?? {},
      })
      await recordAuditEvent(
        ctx,
        grant.workspaceId,
        auditActor(grant.owner, grant),
        {
          operation: "collection.planMigration",
          collectionId: collection._id,
          migrationId,
        }
      )
      return { migrationId }
    }),
})

export const get = internalQuery({
  args: { digest: v.string(), now: v.number(), migrationId: v.string() },
  returns: migrationViewValidator,
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, args.now, ["data.read"], async (grant) => {
      const { migration, collection } = await migrationInWorkspace(
        ctx,
        grant.workspaceId,
        args.migrationId
      )
      return migrationView(migration, collection)
    }),
})

export const dryRun = internalMutation({
  args: { digest: v.string(), migrationId: v.string() },
  returns: v.null(),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["data.write"], async (grant) => {
      const { migration, collection } = await migrationInWorkspace(
        ctx,
        grant.workspaceId,
        args.migrationId
      )
      await startDryRun(ctx, migration, collection)
      return null
    }),
})

export const start = internalMutation({
  args: { digest: v.string(), migrationId: v.string() },
  returns: v.null(),
  handler: (ctx, args) =>
    withGrant(ctx, args.digest, Date.now(), ["data.write"], async (grant) => {
      const { migration, collection } = await migrationInWorkspace(
        ctx,
        grant.workspaceId,
        args.migrationId
      )
      await startMigration(
        ctx,
        migration,
        collection,
        auditActor(grant.owner, grant)
      )
      return null
    }),
})
