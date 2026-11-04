import { v, type Infer } from "convex/values"
import type { Id } from "./_generated/dataModel"
import {
  internalMutation,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { withGrant } from "./lib/agentGrant"
import { requireMembership } from "./lib/auth"
import {
  artifactRelation,
  bindingFields,
  supportsRelation,
} from "./lib/artifactBindingDomain"
import { previewKind } from "./lib/artifactPreview"

async function recordWorkspace(
  ctx: QueryCtx,
  recordId: Id<"collectionRecords">
) {
  const record = await ctx.db.get(recordId)
  const collection = record && (await ctx.db.get(record.collectionId))
  if (!collection) throw new Error("Record unavailable")
  await requireMembership(ctx, collection.workspaceId)
  return collection.workspaceId
}

type Binding = {
  recordId: Id<"collectionRecords">
  artifactId: Id<"artifacts">
  relation: Infer<typeof artifactRelation>
}

/**
 * Links an artifact to a record of `workspaceId`. A link that exists is
 * returned again. The caller has checked that the record is in the workspace.
 */
export async function linkArtifact(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  args: Binding
) {
  const artifact = await ctx.db.get(args.artifactId)
  if (!artifact || artifact.workspaceId !== workspaceId)
    throw new Error("Artifact unavailable in this workspace")
  if (!supportsRelation(artifact.contentType, args.relation))
    throw new Error("File type does not support this relation")
  if (
    args.relation === "report" &&
    previewKind(artifact.contentType) === "html" &&
    artifact.dataTimestamp === undefined
  )
    throw new Error("Set the report data timestamp first")
  const bindings = await ctx.db
    .query("artifactBindings")
    .withIndex("by_recordId", (q) => q.eq("recordId", args.recordId))
    .take(21)
  const existing = bindings.find(
    (b) => b.artifactId === args.artifactId && b.relation === args.relation
  )
  if (existing) return existing._id
  if (bindings.length >= 20)
    throw new Error("A record supports at most 20 file links")
  return ctx.db.insert("artifactBindings", args)
}

/** Removes a link, if it exists. The caller has checked the record. */
export async function unlinkArtifact(ctx: MutationCtx, args: Binding) {
  const rows = await ctx.db
    .query("artifactBindings")
    .withIndex("by_recordId", (q) => q.eq("recordId", args.recordId))
    .take(20)
  const row = rows.find(
    (b) => b.artifactId === args.artifactId && b.relation === args.relation
  )
  if (row) await ctx.db.delete(row._id)
}

export const bind = mutation({
  args: bindingFields,
  returns: v.id("artifactBindings"),
  handler: async (ctx, args) =>
    linkArtifact(ctx, await recordWorkspace(ctx, args.recordId), args),
})
export const unbind = mutation({
  args: bindingFields,
  returns: v.null(),
  handler: async (ctx, args) => {
    await recordWorkspace(ctx, args.recordId)
    await unlinkArtifact(ctx, args)
    return null
  },
})
export const list = query({
  args: { recordId: v.id("collectionRecords") },
  returns: v.array(
    v.object({ ...bindingFields, name: v.union(v.string(), v.null()) })
  ),
  handler: async (ctx, { recordId }) => {
    const workspaceId = await recordWorkspace(ctx, recordId)
    const rows = await ctx.db
      .query("artifactBindings")
      .withIndex("by_recordId", (q) => q.eq("recordId", recordId))
      .take(20)
    return Promise.all(
      rows.map(async (row) => {
        const artifact = await ctx.db.get(row.artifactId)
        return {
          recordId,
          artifactId: row.artifactId,
          relation: row.relation,
          name: artifact?.workspaceId === workspaceId ? artifact.name : null,
        }
      })
    )
  },
})

/** Resolves agent ID strings to a link in the credential's workspace. */
async function agentBinding(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  args: { recordId: string; artifactId: string; relation: Binding["relation"] }
): Promise<Binding> {
  const recordId = ctx.db.normalizeId("collectionRecords", args.recordId)
  const record = recordId && (await ctx.db.get(recordId))
  const collection = record && (await ctx.db.get(record.collectionId))
  if (!recordId || collection?.workspaceId !== workspaceId)
    throw new Error("Record access denied")
  const artifactId = ctx.db.normalizeId("artifacts", args.artifactId)
  if (!artifactId) throw new Error("Artifact unavailable in this workspace")
  return { recordId, artifactId, relation: args.relation }
}

const agentLinkArgs = {
  digest: v.string(),
  recordId: v.string(),
  artifactId: v.string(),
  relation: artifactRelation,
}

/** bind for an agent credential with the data.write scope. */
export const linkForAgent = internalMutation({
  args: agentLinkArgs,
  returns: v.null(),
  handler: (ctx, { digest, ...args }) =>
    withGrant(ctx, digest, Date.now(), ["data.write"], async (grant) => {
      const binding = await agentBinding(ctx, grant.workspaceId, args)
      await linkArtifact(ctx, grant.workspaceId, binding)
      return null
    }),
})

/** unbind for an agent credential with the data.write scope. */
export const unlinkForAgent = internalMutation({
  args: agentLinkArgs,
  returns: v.null(),
  handler: (ctx, { digest, ...args }) =>
    withGrant(ctx, digest, Date.now(), ["data.write"], async (grant) => {
      await unlinkArtifact(
        ctx,
        await agentBinding(ctx, grant.workspaceId, args)
      )
      return null
    }),
})
