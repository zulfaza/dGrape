import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v, type Infer } from "convex/values"
import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { requireMembership } from "./lib/auth"
import type { WorkspaceAccess } from "./lib/workspaceRoles"
import { recordAuditEvent } from "./lib/auditEvents"
import {
  collectionFieldValidator,
  recordValuesValidator,
} from "./lib/collectionDomain"
import { planMigration } from "./lib/collectionSchemas"
import { checkRecord } from "./lib/references"
import {
  fieldChangeValidator,
  fieldChanges,
  MAX_REPORTED_MISFITS,
  migrateValues,
  rollbackLimitations,
  schemaMigrationFields,
} from "./lib/schemaMigrations"

/**
 * Schema migrations for signed-in members: plan an incompatible schema
 * change, then dry run it to find the records that do not fit. See
 * convex/lib/schemaMigrations.ts and docs/collection-schema-history.md.
 */

/**
 * Records read per dry run step. A record holds at most 50,000 characters of
 * text (~200 KB in UTF-8), so a page reads at most ~5 MB.
 */
const DRY_RUN_PAGE = 25

/** A migration as queries return it, with its derived report. */
const migrationViewValidator = v.object({
  _id: v.id("schemaMigrations"),
  _creationTime: v.number(),
  ...schemaMigrationFields,
  changes: v.array(fieldChangeValidator),
  rollbackLimitations: v.array(v.string()),
  /** True when the active schema changed after the plan; plan again. */
  outdated: v.boolean(),
})

function view(
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

/** The migration and its collection, after a membership check. */
async function readMigration(
  ctx: QueryCtx,
  migrationId: Id<"schemaMigrations">,
  access: WorkspaceAccess
) {
  const migration = await ctx.db.get(migrationId)
  const collection = migration && (await ctx.db.get(migration.collectionId))
  if (!migration || !collection) throw new Error("Migration access denied")
  const member = await requireMembership(ctx, collection.workspaceId, access)
  return { migration, collection, member }
}

export const plan = mutation({
  args: {
    collectionId: v.id("collections"),
    expectedVersion: v.number(),
    fields: v.array(collectionFieldValidator),
    defaults: recordValuesValidator,
  },
  returns: v.id("schemaMigrations"),
  handler: async (ctx, { collectionId, ...args }) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Collection access denied")
    const member = await requireMembership(ctx, collection.workspaceId, "write")
    const migrationId = await planMigration(ctx, collection, args)
    await recordAuditEvent(
      ctx,
      collection.workspaceId,
      { kind: "user", userId: member.userId },
      { operation: "collection.planMigration", collectionId, migrationId }
    )
    return migrationId
  },
})

export const get = query({
  args: { migrationId: v.id("schemaMigrations") },
  returns: migrationViewValidator,
  handler: async (ctx, { migrationId }) => {
    const { migration, collection } = await readMigration(
      ctx,
      migrationId,
      "read"
    )
    return view(migration, collection)
  },
})

/** The migrations of a collection, newest first. */
export const list = query({
  args: {
    collectionId: v.id("collections"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(migrationViewValidator),
  handler: async (ctx, { collectionId, paginationOpts }) => {
    const collection = await ctx.db.get(collectionId)
    if (!collection) throw new Error("Collection access denied")
    await requireMembership(ctx, collection.workspaceId, "read")
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 20
    )
      throw new Error("Page size must be between 1 and 20")
    const result = await ctx.db
      .query("schemaMigrations")
      .withIndex("by_collectionId", (q) => q.eq("collectionId", collectionId))
      .order("desc")
      .paginate(paginationOpts)
    return {
      ...result,
      page: result.page.map((migration) => view(migration, collection)),
    }
  },
})

/**
 * Starts a dry run, or starts it again after a finished one. The dry run
 * does not lock the collection, so records can change while it runs.
 */
export const dryRun = mutation({
  args: { migrationId: v.id("schemaMigrations") },
  returns: v.null(),
  handler: async (ctx, { migrationId }) => {
    const { migration, collection } = await readMigration(
      ctx,
      migrationId,
      "write"
    )
    if (collection.definition.version !== migration.source.version)
      throw new Error(
        "The collection schema changed after this plan; plan the migration again"
      )
    if (
      migration.state.kind !== "planned" &&
      migration.state.kind !== "checked"
    )
      throw new Error(`A ${migration.state.kind} migration cannot dry run`)
    await ctx.db.patch(migrationId, {
      state: {
        kind: "dryRunning",
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
    return null
  },
})

/**
 * Reads that the reference targets of one record can need: at most 50
 * fields, each a record of ~200 KB. Before each record after the first, a
 * step stops when less than this is left of the 16 MiB read limit.
 */
const READ_RESERVE_BYTES = 10 * 1024 * 1024
const READ_RESERVE_DOCUMENTS = 200

async function readBudgetLow(ctx: MutationCtx) {
  const { bytesRead, documentsRead } = await ctx.meta.getTransactionMetrics()
  return (
    bytesRead.remaining < READ_RESERVE_BYTES ||
    documentsRead.remaining < READ_RESERVE_DOCUMENTS
  )
}

/** Why `record` does not fit the target of `migration`, or null. */
async function misfit(
  ctx: MutationCtx,
  collection: Doc<"collections">,
  migration: Doc<"schemaMigrations">,
  record: Doc<"collectionRecords">
): Promise<string | null> {
  const migrated = migrateValues(
    migration.source.fields,
    migration.target.fields,
    migration.defaults,
    record.values
  )
  if (!migrated.ok) return migrated.message
  const checked = await checkRecord(
    ctx,
    { ...collection, definition: migration.target },
    migrated.value
  )
  return checked.ok ? null : checked.message
}

/**
 * Checks one page of records after `after`, then schedules the next page. A
 * step whose `after` no longer matches the stored state is a duplicate or
 * belongs to a cancelled run, and does nothing.
 */
export const dryRunStep = internalMutation({
  args: {
    migrationId: v.id("schemaMigrations"),
    after: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { migrationId, after }) => {
    const migration = await ctx.db.get(migrationId)
    const state = migration?.state
    if (!migration || state?.kind !== "dryRunning" || state.after !== after)
      return null
    const collection = await ctx.db.get(migration.collectionId)
    if (
      !collection ||
      collection.definition.version !== migration.source.version
    ) {
      await ctx.db.patch(migrationId, { state: { kind: "planned" } })
      return null
    }
    const page = await ctx.db
      .query("collectionRecords")
      .withIndex("by_collection", (q) =>
        after === null
          ? q.eq("collectionId", collection._id)
          : q.eq("collectionId", collection._id).gt("_creationTime", after)
      )
      .take(DRY_RUN_PAGE)
    let { misfitCount } = state
    const misfits = [...state.misfits]
    const checked: Array<Doc<"collectionRecords">> = []
    let budgetLow = false
    for (const record of page) {
      budgetLow = checked.length > 0 && (await readBudgetLow(ctx))
      if (budgetLow) break
      const message = await misfit(ctx, collection, migration, record)
      checked.push(record)
      if (message !== null) {
        misfitCount += 1
        if (misfits.length < MAX_REPORTED_MISFITS)
          misfits.push({ recordId: record._id, message })
      }
    }
    const progress = {
      checked: state.checked + checked.length,
      misfitCount,
      misfits,
    }
    const last = checked.at(-1)
    if ((!budgetLow && page.length < DRY_RUN_PAGE) || !last) {
      await ctx.db.patch(migrationId, {
        state: { kind: "checked", ...progress },
      })
      return null
    }
    await ctx.db.patch(migrationId, {
      state: { kind: "dryRunning", after: last._creationTime, ...progress },
    })
    await ctx.scheduler.runAfter(0, internal.schemaMigrations.dryRunStep, {
      migrationId,
      after: last._creationTime,
    })
    return null
  },
})

/** Stops a migration that has not started to change records. */
export const cancel = mutation({
  args: { migrationId: v.id("schemaMigrations") },
  returns: v.null(),
  handler: async (ctx, { migrationId }) => {
    const { migration, collection, member } = await readMigration(
      ctx,
      migrationId,
      "write"
    )
    if (migration.state.kind === "cancelled") return null
    await ctx.db.patch(migrationId, { state: { kind: "cancelled" } })
    await recordAuditEvent(
      ctx,
      collection.workspaceId,
      { kind: "user", userId: member.userId },
      {
        operation: "collection.cancelMigration",
        collectionId: collection._id,
        migrationId,
      }
    )
    return null
  },
})
