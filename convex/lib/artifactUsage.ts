import { v, type Infer } from "convex/values"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"
import { workspaceBudgets } from "./budgets"

/**
 * The bytes and number of artifacts in a workspace (`workspaceUsage`). It is
 * a separate table, so artifact writes do not conflict with the many
 * transactions that read the workspace document. It changes in the same
 * mutation as the artifact insert or delete, so a retried mutation cannot
 * count a file twice.
 *
 * - "counted": `bytes` and `count` are exact.
 * - "counting": convex/artifactUsage.ts scans the artifacts in
 *   `_creationTime` order. The totals hold the artifacts up to `after`
 *   (null: none scanned yet). A write changes them only if the artifact is at
 *   or before `after`; the scan counts the later artifacts.
 *
 * A workspace made before usage existed has no row. Its first artifact
 * write, or `artifactUsage.startAll`, starts the scan.
 */
export const artifactUsageValidator = v.union(
  v.object({
    kind: v.literal("counted"),
    bytes: v.number(),
    count: v.number(),
  }),
  v.object({
    kind: v.literal("counting"),
    after: v.union(v.number(), v.null()),
    bytes: v.number(),
    count: v.number(),
  })
)
export type ArtifactUsage = Infer<typeof artifactUsageValidator>

export const EMPTY_ARTIFACT_USAGE: ArtifactUsage = {
  kind: "counted",
  bytes: 0,
  count: 0,
}

export function usageRow(ctx: QueryCtx, workspaceId: Id<"workspaces">) {
  return ctx.db
    .query("workspaceUsage")
    .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
    .unique()
}

/** Starts the scan for a workspace that has no usage row. */
export async function startArtifactUsage(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">
): Promise<Doc<"workspaceUsage">> {
  const artifacts: ArtifactUsage = {
    kind: "counting",
    after: null,
    bytes: 0,
    count: 0,
  }
  const id = await ctx.db.insert("workspaceUsage", { workspaceId, artifacts })
  await ctx.scheduler.runAfter(0, internal.artifactUsage.scan, {
    workspaceId,
    after: null,
  })
  const row = await ctx.db.get(id)
  if (!row) throw new Error("Usage row missing")
  return row
}

/** Adds (`sign` 1) or removes (`sign` -1) one artifact from the usage. */
export async function changeArtifactUsage(
  ctx: MutationCtx,
  artifact: Doc<"artifacts">,
  sign: 1 | -1
) {
  const row =
    (await usageRow(ctx, artifact.workspaceId)) ??
    (await startArtifactUsage(ctx, artifact.workspaceId))
  const usage = row.artifacts
  const counted =
    usage.kind === "counted" ||
    (usage.after !== null && artifact._creationTime <= usage.after)
  if (!counted) return
  await ctx.db.patch(row._id, {
    artifacts: {
      ...usage,
      bytes: usage.bytes + sign * artifact.size,
      count: usage.count + sign,
    },
  })
}

/**
 * Why the workspace cannot store one more file of `size` bytes, or null.
 * While the scan runs, the totals are a lower bound.
 */
export async function artifactBudgetProblem(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  size: number
): Promise<string | null> {
  const budgets = await workspaceBudgets(ctx, workspaceId)
  if (size > budgets.artifactFileBytes)
    return `A file can be at most ${budgets.artifactFileBytes} bytes.`
  const used = (await usageRow(ctx, workspaceId))?.artifacts.bytes ?? 0
  if (used + size > budgets.artifactTotalBytes)
    return `This workspace can store at most ${budgets.artifactTotalBytes} bytes of files. Delete files first.`
  return null
}
