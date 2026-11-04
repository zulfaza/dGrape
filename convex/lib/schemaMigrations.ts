import { v, type Infer } from "convex/values"
import {
  checkRecordValues,
  collectionDefinitionValidator,
  collectionFieldValidator,
  recordValuesValidator,
  type Checked,
  type CollectionField,
  type RecordValue,
  type RecordValues,
} from "./collectionDomain"

/**
 * Rules for schema migrations: changes that `publishCompatibleSchema` rejects
 * (type, requiredness, options, index or field removal). A migration is a
 * plan from the active `source` definition to a `target` definition with the
 * next version. A dry run reads every record and reports the records whose
 * values do not fit the target. See docs/collection-schema-history.md.
 *
 * These functions are pure; convex/schemaMigrations.ts stores the plan and
 * runs the dry run in bounded steps.
 */

/** At most this many records that do not fit are kept in a dry run report. */
export const MAX_REPORTED_MISFITS = 20

/** A record that does not fit the target definition, and why. */
const misfitValidator = v.object({
  recordId: v.id("collectionRecords"),
  message: v.string(),
})

const dryRunProgress = {
  /** Records read so far. */
  checked: v.number(),
  /** Records that do not fit, of the records read so far. */
  misfitCount: v.number(),
  /** The first `MAX_REPORTED_MISFITS` records that do not fit. */
  misfits: v.array(misfitValidator),
}

const after = v.union(v.number(), v.null())

/**
 * The plan's steps. Records are read in `_creationTime` order; `after` is the
 * last record read (null: none yet).
 *
 * - "planned": no dry run yet.
 * - "dryRunning": a dry run reads the records. It changes nothing.
 * - "checked": the dry run read every record. The migration can start only
 *   when `misfitCount` is 0.
 * - "validating": the migration started and holds the collection lock (see
 *   `migrationLockValidator`). It checks every record again before it writes
 *   any. If a record does not fit, it releases the lock and returns to
 *   "checked" with the report.
 * - "backfilling": every record fits; it writes the target values. `error`
 *   is set when a step stopped; starting again resumes from `after`.
 * - "active": every record was written, and the target definition is active.
 * - "cancelled": the plan cannot run.
 */
export const migrationStateValidator = v.union(
  v.object({ kind: v.literal("planned") }),
  v.object({ kind: v.literal("dryRunning"), after, ...dryRunProgress }),
  v.object({ kind: v.literal("checked"), ...dryRunProgress }),
  v.object({ kind: v.literal("validating"), after, ...dryRunProgress }),
  v.object({
    kind: v.literal("backfilling"),
    after,
    /** Records written so far. */
    written: v.number(),
    error: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("active"),
    written: v.number(),
    activatedAt: v.number(),
  }),
  v.object({ kind: v.literal("cancelled") })
)
export type MigrationState = Infer<typeof migrationStateValidator>

/**
 * Set on a collection while a migration validates or backfills it. Record
 * writes and schema changes fail, and saved queries and pages report the
 * migration, until the migration is active or returns to "checked".
 */
export const migrationLockValidator = v.object({
  migrationId: v.id("schemaMigrations"),
  targetVersion: v.number(),
})
export type MigrationLock = Infer<typeof migrationLockValidator>

/** The error for a change that the lock blocks. */
export function migratingMessage(lock: MigrationLock) {
  return `The collection is migrating to schema version ${lock.targetVersion}; try again when the migration is active`
}

export const schemaMigrationFields = {
  collectionId: v.id("collections"),
  /** The active definition when the plan was made. */
  source: collectionDefinitionValidator,
  /** The definition after the migration; its version is `source.version + 1`. */
  target: collectionDefinitionValidator,
  /** Values for records that have no value for a target field. */
  defaults: recordValuesValidator,
  state: migrationStateValidator,
}

/** One difference between the source and target definitions. */
export const fieldChangeValidator = v.union(
  v.object({ kind: v.literal("added"), field: collectionFieldValidator }),
  v.object({ kind: v.literal("removed"), field: collectionFieldValidator }),
  v.object({
    kind: v.literal("changed"),
    before: collectionFieldValidator,
    after: collectionFieldValidator,
  })
)
export type FieldChange = Infer<typeof fieldChangeValidator>

/** The fields that a migration adds, removes, or changes. Order is ignored. */
export function fieldChanges(
  source: ReadonlyArray<CollectionField>,
  target: ReadonlyArray<CollectionField>
): FieldChange[] {
  const changes: FieldChange[] = []
  for (const before of source) {
    const after = target.find((field) => field.id === before.id)
    if (!after) changes.push({ kind: "removed", field: before })
    else if (!sameField(before, after))
      changes.push({ kind: "changed", before, after })
  }
  for (const field of target)
    if (!source.some((before) => before.id === field.id))
      changes.push({ kind: "added", field })
  return changes
}

function sameField(a: CollectionField, b: CollectionField) {
  return (
    a.label === b.label &&
    a.type === b.type &&
    a.optional === b.optional &&
    a.indexed === b.indexed &&
    (a.type !== "recordReference" ||
      (b.type === "recordReference" && a.collectionId === b.collectionId)) &&
    sameOptions(optionsOf(a), optionsOf(b))
  )
}

function sameOptions(a: ReadonlyArray<string>, b: ReadonlyArray<string>) {
  return a.length === b.length && a.every((option, i) => option === b[i])
}

function optionsOf(field: CollectionField): ReadonlyArray<string> {
  return field.type === "select" || field.type === "multiSelect"
    ? field.options
    : []
}

/**
 * What a later schema change cannot undo after the migration: removed values
 * are deleted, and converted values may not convert back to the original.
 */
export function rollbackLimitations(changes: ReadonlyArray<FieldChange>) {
  return changes.flatMap((change) => {
    if (change.kind === "removed")
      return [
        `Field "${change.field.id}" is removed. Its values are deleted from records and a later schema change cannot restore them.`,
      ]
    if (change.kind === "changed" && change.before.type !== change.after.type)
      return [
        `Field "${change.after.id}" changes from ${change.before.type} to ${change.after.type}. A change back may not restore the original values.`,
      ]
    return []
  })
}

/**
 * Checks the defaults of a plan: each names a target field that is not a
 * reference and holds a valid value for it. A reference default could point
 * to a record or artifact that is deleted before the backfill writes it.
 */
export function checkDefaults(
  target: ReadonlyArray<CollectionField>,
  defaults: RecordValues
): Checked<RecordValues> {
  for (const [id, value] of Object.entries(defaults)) {
    const field = target.find((candidate) => candidate.id === id)
    if (!field) return invalid(`Default for unknown field "${id}"`)
    if (field.type === "recordReference" || field.type === "artifactReference")
      return invalid(`Field "${id}" is a reference and cannot have a default`)
    const checked = checkRecordValues([{ ...field, optional: true }], {
      [id]: value,
    })
    if (!checked.ok) return checked
  }
  return { ok: true, value: defaults }
}

const invalid = (message: string): Checked<never> => ({ ok: false, message })

/** Parses a number from text, or returns undefined. */
function parseNumber(text: string): number | undefined {
  const trimmed = text.trim()
  const parsed = Number(trimmed)
  return trimmed !== "" && Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Converts one value of `before` to a candidate value of `after`, or returns
 * undefined when no conversion applies. `checkRecordValues` then checks the
 * candidate (options, integer range, date format, text length). Values never
 * convert into a reference from another type or another target collection.
 */
export function convertValue(
  before: CollectionField,
  after: CollectionField,
  value: RecordValue
): RecordValue | undefined {
  if (after.type === "recordReference")
    return before.type === "recordReference" &&
      before.collectionId === after.collectionId
      ? value
      : undefined
  if (after.type === "artifactReference")
    return before.type === "artifactReference" ? value : undefined
  if (before.type === after.type) return value
  switch (after.type) {
    case "text":
    case "currency":
    case "date":
      return Array.isArray(value) ? undefined : String(value)
    case "number":
    case "integer":
    case "timestamp":
      // String() of a number round-trips; booleans do not parse.
      return Array.isArray(value) ? undefined : parseNumber(String(value))
    case "boolean":
      if (value === "true") return true
      if (value === "false") return false
      return undefined
    case "select":
      if (!Array.isArray(value)) return String(value)
      return value.length === 1 ? value[0] : undefined
    case "multiSelect":
      return Array.isArray(value) ? undefined : [String(value)]
  }
}

/**
 * The values of a record after the migration, or why the record does not
 * fit. Values of removed fields are dropped. A missing value takes the
 * plan's default. Reference targets are checked by the caller.
 */
export function migrateValues(
  source: ReadonlyArray<CollectionField>,
  target: ReadonlyArray<CollectionField>,
  defaults: RecordValues,
  values: RecordValues
): Checked<RecordValues> {
  const migrated: RecordValues = {}
  for (const field of target) {
    const before = source.find((candidate) => candidate.id === field.id)
    if (!before || !Object.hasOwn(values, field.id)) {
      if (Object.hasOwn(defaults, field.id))
        migrated[field.id] = defaults[field.id]
      continue
    }
    const converted = convertValue(before, field, values[field.id])
    if (converted === undefined)
      return invalid(
        `Field "${field.id}" has a ${before.type} value that does not convert to ${field.type}`
      )
    migrated[field.id] = converted
  }
  return checkRecordValues(target, migrated)
}
