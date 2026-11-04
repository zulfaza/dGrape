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
import { activateDefinition, planMigration } from "./lib/collectionSchemas"
import { migrateRecord } from "./lib/records"
import { checkRecord } from "./lib/references"
import {
  fieldChangeValidator,
  fieldChanges,
  MAX_REPORTED_MISFITS,
  migratingMessage,
  migrateValues,
  rollbackLimitations,
  schemaMigrationFields,
} from "./lib/schemaMigrations"

/**
 * Schema migrations for signed-in members: plan an incompatible schema
 * change, dry run it to find the records that do not fit, then start it to
 * validate, backfill, and activate it. See
 * convex/lib/schemaMigrations.ts and docs/collection-schema-history.md.
 */

/**
 * Records read per dry run step. A record holds at most 50,000 characters of
 * text (~200 KB in UTF-8), so a page reads at most ~5 MB.
 */
const DRY_RUN_PAGE = 25
/**
 * Records written per backfill step. Each write also replaces the record's
 * index entries and references.
 */
const BACKFILL_PAGE = 25

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
/**
 * Writes that one backfilled record can need: up to 500 index entries (five
 * indexed multi-select fields of 100 options) and 50 references, each
 * deleted and inserted again, plus the record and its collection.
 */
const WRITE_RESERVE_DOCUMENTS = 1_200
const WRITE_RESERVE_BYTES = 2 * 1024 * 1024

async function budgetLow(ctx: MutationCtx) {
  const { bytesRead, documentsRead, bytesWritten, documentsWritten } =
    await ctx.meta.getTransactionMetrics()
  return (
    bytesRead.remaining < READ_RESERVE_BYTES ||
    documentsRead.remaining < READ_RESERVE_DOCUMENTS ||
    bytesWritten.remaining < WRITE_RESERVE_BYTES ||
    documentsWritten.remaining < WRITE_RESERVE_DOCUMENTS
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

/** Records after `after` in `_creationTime` order, at most `limit`. */
function recordsAfter(
  ctx: QueryCtx,
  collectionId: Id<"collections">,
  after: number | null,
  limit: number
) {
  return ctx.db
    .query("collectionRecords")
    .withIndex("by_collection", (q) =>
      after === null
        ? q.eq("collectionId", collectionId)
        : q.eq("collectionId", collectionId).gt("_creationTime", after)
    )
    .take(limit)
}

/**
 * Checks one page of records after `after` for a dry run or a validation,
 * then schedules the next page. A step whose `after` no longer matches the
 * stored state is a duplicate or belongs to a cancelled run, and does
 * nothing. A validation that finds no misfit starts the backfill; one that
 * finds a misfit releases the lock and reports it.
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
    if (
      !migration ||
      (state?.kind !== "dryRunning" && state?.kind !== "validating") ||
      state.after !== after
    )
      return null
    const collection = await ctx.db.get(migration.collectionId)
    if (
      !collection ||
      collection.definition.version !== migration.source.version
    ) {
      // Only an unlocked dry run can see a schema change.
      await ctx.db.patch(migrationId, { state: { kind: "planned" } })
      return null
    }
    const page = await recordsAfter(ctx, collection._id, after, DRY_RUN_PAGE)
    let { misfitCount } = state
    const misfits = [...state.misfits]
    const checked: Array<Doc<"collectionRecords">> = []
    let stopped = false
    for (const record of page) {
      stopped = checked.length > 0 && (await budgetLow(ctx))
      if (stopped) break
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
    if (last && (stopped || page.length === DRY_RUN_PAGE)) {
      await ctx.db.patch(migrationId, {
        state: { kind: state.kind, after: last._creationTime, ...progress },
      })
      await ctx.scheduler.runAfter(0, internal.schemaMigrations.dryRunStep, {
        migrationId,
        after: last._creationTime,
      })
      return null
    }
    if (state.kind === "dryRunning" || misfitCount > 0) {
      await ctx.db.patch(migrationId, {
        state: { kind: "checked", ...progress },
      })
      if (state.kind === "validating")
        await ctx.db.patch(collection._id, { migrationLock: undefined })
      return null
    }
    await ctx.db.patch(migrationId, {
      state: { kind: "backfilling", after: null, written: 0, error: null },
    })
    await ctx.scheduler.runAfter(0, internal.schemaMigrations.backfillStep, {
      migrationId,
      after: null,
    })
    return null
  },
})

/**
 * Starts a migration whose dry run found no misfit: it locks the collection,
 * checks every record again, writes the target values, and then activates
 * the target definition. For a migration whose step stopped, it schedules
 * the step again from the stored cursor.
 */
export const start = mutation({
  args: { migrationId: v.id("schemaMigrations") },
  returns: v.null(),
  handler: async (ctx, { migrationId }) => {
    const { migration, collection, member } = await readMigration(
      ctx,
      migrationId,
      "write"
    )
    const { state } = migration
    const lockedByThis = collection.migrationLock?.migrationId === migration._id
    if (state.kind === "validating" && lockedByThis) {
      await ctx.scheduler.runAfter(0, internal.schemaMigrations.dryRunStep, {
        migrationId,
        after: state.after,
      })
      return null
    }
    if (state.kind === "backfilling" && lockedByThis) {
      await ctx.db.patch(migrationId, { state: { ...state, error: null } })
      await ctx.scheduler.runAfter(0, internal.schemaMigrations.backfillStep, {
        migrationId,
        after: state.after,
      })
      return null
    }
    if (state.kind !== "checked")
      throw new Error("Dry run the migration before it starts")
    if (state.misfitCount > 0)
      throw new Error(
        `${state.misfitCount} records do not fit the target schema; change them and dry run again`
      )
    if (collection.definition.version !== migration.source.version)
      throw new Error(
        "The collection schema changed after this plan; plan the migration again"
      )
    if (collection.migrationLock)
      throw new Error(migratingMessage(collection.migrationLock))
    await ctx.db.patch(collection._id, {
      migrationLock: {
        migrationId,
        targetVersion: migration.target.version,
      },
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
    await recordAuditEvent(
      ctx,
      collection.workspaceId,
      { kind: "user", userId: member.userId },
      {
        operation: "collection.startMigration",
        collectionId: collection._id,
        migrationId,
      }
    )
    return null
  },
})

/**
 * Writes the target values of one page of records after `after`, then
 * schedules the next page. After the last page it activates the target
 * definition and releases the lock. A duplicate step does nothing, and each
 * step is one transaction, so a retried step cannot write a record twice.
 */
export const backfillStep = internalMutation({
  args: {
    migrationId: v.id("schemaMigrations"),
    after: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { migrationId, after }) => {
    const migration = await ctx.db.get(migrationId)
    const state = migration?.state
    if (
      !migration ||
      state?.kind !== "backfilling" ||
      state.after !== after ||
      state.error !== null
    )
      return null
    const collection = await ctx.db.get(migration.collectionId)
    if (!collection || collection.migrationLock?.migrationId !== migrationId)
      return null
    const target = { ...collection, definition: migration.target }
    const page = await recordsAfter(ctx, collection._id, after, BACKFILL_PAGE)
    let last: Doc<"collectionRecords"> | undefined
    let written = state.written
    let stopped = false
    for (const record of page) {
      stopped = last !== undefined && (await budgetLow(ctx))
      if (stopped) break
      const migrated = migrateValues(
        migration.source.fields,
        migration.target.fields,
        migration.defaults,
        record.values
      )
      const checked = migrated.ok
        ? await checkRecord(ctx, target, migrated.value)
        : migrated
      if (!checked.ok) {
        // The lock keeps records from changing after the validation, so
        // this needs a fix in the data or the plan. The cursor keeps the
        // records written before this one, so a resume does not write them
        // again.
        await ctx.db.patch(migrationId, {
          state: {
            ...state,
            after: last?._creationTime ?? after,
            written,
            error: `Record ${record._id}: ${checked.message}`,
          },
        })
        return null
      }
      await migrateRecord(ctx, target, record, checked.value)
      last = record
      written += 1
    }
    if (last && (stopped || page.length === BACKFILL_PAGE)) {
      await ctx.db.patch(migrationId, {
        state: { ...state, after: last._creationTime, written },
      })
      await ctx.scheduler.runAfter(0, internal.schemaMigrations.backfillStep, {
        migrationId,
        after: last._creationTime,
      })
      return null
    }
    await activateDefinition(ctx, collection, migration.target, migrationId)
    await ctx.db.patch(migrationId, {
      state: { kind: "active", written, activatedAt: Date.now() },
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
    const { kind } = migration.state
    if (kind === "cancelled") return null
    if (kind !== "planned" && kind !== "dryRunning" && kind !== "checked")
      throw new Error(`A ${kind} migration cannot be cancelled`)
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
