import {
  MAX_PREVIEW_BYTES,
  MAX_RASTER_BYTES,
  previewKind,
  readPreview,
} from "./lib/artifactPreview"
import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server"
import { v, type Infer } from "convex/values"
import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server"
import {
  DOWNLOAD_URL_SECONDS,
  MAX_ARTIFACT_BYTES,
  UPLOAD_WINDOW_MS,
  artifactCreatorValidator,
  artifactValidator,
  checkArtifactName,
  newObjectKey,
} from "./lib/artifactDomain"
import { requireMembership } from "./lib/auth"
import { r2 } from "./lib/r2"

/**
 * Artifact functions. The public ones serve the signed-in app. The internal
 * ones are shared with the agent API (convex/http.ts), which checks the
 * credential first. See convex/lib/artifactDomain.ts for the upload steps.
 */

const createUploadResult = v.union(
  v.object({ status: v.literal("invalid"), message: v.string() }),
  v.object({
    status: v.literal("created"),
    key: v.string(),
    url: v.string(),
    expiresAt: v.number(),
  })
)

const createUploadArgs = v.object({
  workspaceId: v.id("workspaces"),
  name: v.string(),
  createdBy: artifactCreatorValidator,
  now: v.number(),
})

/** Records a pending upload and returns its signed PUT URL. */
async function createPendingUpload(
  ctx: MutationCtx,
  args: Infer<typeof createUploadArgs>
): Promise<Infer<typeof createUploadResult>> {
  const name = checkArtifactName(args.name)
  if (!name.ok) return { status: "invalid", message: name.message }
  const { key, url } = await r2.generateUploadUrl(
    newObjectKey(args.workspaceId)
  )
  const expiresAt = args.now + UPLOAD_WINDOW_MS
  await ctx.db.insert("artifactUploads", {
    workspaceId: args.workspaceId,
    key,
    name: name.value,
    createdBy: args.createdBy,
    expiresAt,
  })
  return { status: "created", key, url, expiresAt }
}

export const insertUpload = internalMutation({
  args: createUploadArgs.fields,
  returns: createUploadResult,
  handler: createPendingUpload,
})

export const getUpload = internalQuery({
  args: { key: v.string() },
  returns: v.union(
    v.null(),
    v.object({ workspaceId: v.id("workspaces"), expiresAt: v.number() })
  ),
  handler: async (ctx, { key }) => {
    const upload = await ctx.db
      .query("artifactUploads")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
    if (!upload) return null
    return { workspaceId: upload.workspaceId, expiresAt: upload.expiresAt }
  },
})

/** Moves a pending upload to the artifacts table. */
export const insertArtifact = internalMutation({
  args: { key: v.string(), contentType: v.string(), size: v.number() },
  returns: v.union(v.null(), v.id("artifacts")),
  handler: async (ctx, { key, contentType, size }) => {
    const upload = await ctx.db
      .query("artifactUploads")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
    if (!upload) return null
    await ctx.db.delete(upload._id)
    return ctx.db.insert("artifacts", {
      workspaceId: upload.workspaceId,
      key,
      name: upload.name,
      contentType,
      size,
      createdBy: upload.createdBy,
    })
  },
})

export const deleteUpload = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    const upload = await ctx.db
      .query("artifactUploads")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
    if (upload) await ctx.db.delete(upload._id)
    return null
  },
})

const completeResult = v.union(
  v.object({ status: v.literal("invalid"), message: v.string() }),
  v.object({ status: v.literal("completed"), artifactId: v.id("artifacts") })
)

/**
 * Reads the uploaded object's size and type from R2 and records the
 * artifact. A file over the size limit is deleted.
 */
async function finishUpload(
  ctx: ActionCtx,
  workspaceId: Id<"workspaces">,
  key: string
): Promise<Infer<typeof completeResult>> {
  const upload = await ctx.runQuery(internal.artifacts.getUpload, { key })
  if (!upload || upload.workspaceId !== workspaceId)
    return { status: "invalid", message: "The upload does not exist." }
  if (upload.expiresAt <= Date.now())
    return { status: "invalid", message: "The upload expired. Start again." }
  try {
    await r2.syncMetadata(ctx, key)
  } catch {
    return { status: "invalid", message: "Upload the file to the URL first." }
  }
  const metadata = await r2.getMetadata(ctx, key)
  if (!metadata || metadata.size === undefined)
    return { status: "invalid", message: "Upload the file to the URL first." }
  if (metadata.size > MAX_ARTIFACT_BYTES) {
    await r2.deleteObject(ctx, key)
    await ctx.runMutation(internal.artifacts.deleteUpload, { key })
    return {
      status: "invalid",
      message: `A file can be at most ${MAX_ARTIFACT_BYTES / 1024 / 1024} MB.`,
    }
  }
  const artifactId = await ctx.runMutation(internal.artifacts.insertArtifact, {
    key,
    contentType: metadata.contentType ?? "application/octet-stream",
    size: metadata.size,
  })
  if (!artifactId)
    return { status: "invalid", message: "The upload does not exist." }
  return { status: "completed", artifactId }
}

export const completeUploadForWorkspace = internalAction({
  args: { workspaceId: v.id("workspaces"), key: v.string() },
  returns: completeResult,
  handler: (ctx, { workspaceId, key }) => finishUpload(ctx, workspaceId, key),
})

export const getArtifact = internalQuery({
  args: { artifactId: v.string() },
  returns: v.union(v.null(), artifactValidator),
  handler: async (ctx, { artifactId }) => {
    const id = ctx.db.normalizeId("artifacts", artifactId)
    return id && ctx.db.get(id)
  },
})

/** A short-lived signed GET URL on the R2 origin. */
export function downloadUrl(key: string) {
  return r2.getUrl(key, { expiresIn: DOWNLOAD_URL_SECONDS })
}

export const listForWorkspace = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    cursor: v.union(v.string(), v.null()),
    limit: v.number(),
  },
  returns: paginationResultValidator(artifactValidator),
  // Callers (convex/http.ts) validate limit and cursor size at the boundary.
  handler: (ctx, { workspaceId, cursor, limit }) =>
    ctx.db
      .query("artifacts")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .paginate({ cursor, numItems: limit }),
})

// ---- Signed-in app ----

export const createUpload = mutation({
  args: { workspaceId: v.id("workspaces"), name: v.string() },
  returns: v.object({ key: v.string(), url: v.string() }),
  handler: async (ctx, { workspaceId, name }) => {
    const member = await requireMembership(ctx, workspaceId)
    const result = await createPendingUpload(ctx, {
      workspaceId,
      name,
      createdBy: { kind: "user", userId: member.userId },
      now: Date.now(),
    })
    if (result.status === "invalid") throw new Error(result.message)
    return { key: result.key, url: result.url }
  },
})

export const membership = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, { workspaceId }) => {
    await requireMembership(ctx, workspaceId)
    return null
  },
})

export const completeUpload = action({
  args: { workspaceId: v.id("workspaces"), key: v.string() },
  returns: completeResult,
  handler: async (
    ctx,
    { workspaceId, key }
  ): Promise<Infer<typeof completeResult>> => {
    await ctx.runQuery(internal.artifacts.membership, { workspaceId })
    return finishUpload(ctx, workspaceId, key)
  },
})

export const list = query({
  args: {
    workspaceId: v.id("workspaces"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(artifactValidator),
  handler: async (ctx, { workspaceId, paginationOpts }) => {
    await requireMembership(ctx, workspaceId)
    if (
      !Number.isInteger(paginationOpts.numItems) ||
      paginationOpts.numItems < 1 ||
      paginationOpts.numItems > 50
    )
      throw new Error("Invalid page size")
    return ctx.db
      .query("artifacts")
      .withIndex("by_workspaceId", (q) => q.eq("workspaceId", workspaceId))
      .order("desc")
      .paginate(paginationOpts)
  },
})

export const getDownloadUrl = action({
  args: { artifactId: v.id("artifacts") },
  returns: v.string(),
  handler: async (ctx, { artifactId }): Promise<string> => {
    const artifact = await ctx.runQuery(internal.artifacts.getArtifact, {
      artifactId,
    })
    if (!artifact) throw new Error("Artifact not found")
    await ctx.runQuery(internal.artifacts.membership, {
      workspaceId: artifact.workspaceId,
    })
    return downloadUrl(artifact.key)
  },
})

export const remove = mutation({
  args: { artifactId: v.id("artifacts") },
  returns: v.null(),
  handler: async (ctx, { artifactId }) => {
    const artifact = await ctx.db.get(artifactId)
    if (!artifact) throw new Error("Artifact not found")
    await requireMembership(ctx, artifact.workspaceId)
    await r2.deleteObject(ctx, artifact.key)
    await ctx.db.delete(artifactId)
    return null
  },
})

/** Text previews never send signed object URLs or executable content to the UI. */
export const getPreview = action({
  args: { artifactId: v.id("artifacts") },
  returns: v.union(
    v.object({ status: v.literal("unavailable"), message: v.string() }),
    v.object({
      status: v.literal("ready"),
      text: v.string(),
      capturedAt: v.number(),
      kind: v.union(
        v.literal("text"),
        v.literal("json"),
        v.literal("html"),
        v.literal("raster")
      ),
    })
  ),
  handler: async (
    ctx,
    { artifactId }
  ): Promise<
    | { status: "unavailable"; message: string }
    | {
        status: "ready"
        text: string
        capturedAt: number
        kind: "text" | "json" | "html" | "raster"
      }
  > => {
    const artifact = await ctx.runQuery(internal.artifacts.getArtifact, {
      artifactId,
    })
    if (!artifact) throw new Error("Artifact not found")
    await ctx.runQuery(internal.artifacts.membership, {
      workspaceId: artifact.workspaceId,
    })
    const kind = previewKind(artifact.contentType)
    if (kind === "html" && artifact.dataTimestamp === undefined)
      return {
        status: "unavailable",
        message:
          "Set the report data timestamp to enable this static HTML snapshot.",
      }
    if (kind === "unsupported")
      return {
        status: "unavailable",
        message:
          "Preview is not available for this file type. Download the file to view it.",
      }
    if (
      artifact.size > (kind === "raster" ? MAX_RASTER_BYTES : MAX_PREVIEW_BYTES)
    )
      return {
        status: "unavailable",
        message:
          "Preview supports text/HTML up to 512 KB and raster images up to 1 MB. Download the file to view it.",
      }
    try {
      const response = await fetch(await downloadUrl(artifact.key), {
        credentials: "omit",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      })
      const text = await readPreview(response, artifact.contentType)
      return {
        status: "ready",
        text,
        kind,
        capturedAt:
          kind === "html"
            ? (artifact.dataTimestamp ?? artifact._creationTime)
            : artifact._creationTime,
      }
    } catch {
      return {
        status: "unavailable",
        message:
          "The file could not be previewed. It may be unavailable, invalid, or exceed the preview size limit.",
      }
    }
  },
})

/** Metadata lookup scoped to the containing record or page's workspace. */
export const metadata = query({
  args: { workspaceId: v.id("workspaces"), artifactId: v.id("artifacts") },
  returns: v.union(
    v.null(),
    v.object({ name: v.string(), contentType: v.string(), size: v.number() })
  ),
  handler: async (ctx, { workspaceId, artifactId }) => {
    await requireMembership(ctx, workspaceId)
    const artifact = await ctx.db.get(artifactId)
    if (!artifact || artifact.workspaceId !== workspaceId) return null
    return {
      name: artifact.name,
      contentType: artifact.contentType,
      size: artifact.size,
    }
  },
})

/** Explicit report data time, independent of upload time; workspace members only. */
export const setDataTimestamp = mutation({
  args: {
    artifactId: v.id("artifacts"),
    dataTimestamp: v.union(v.number(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { artifactId, dataTimestamp }) => {
    const artifact = await ctx.db.get(artifactId)
    if (!artifact) throw new Error("Artifact not found")
    await requireMembership(ctx, artifact.workspaceId)
    if (previewKind(artifact.contentType) !== "html")
      throw new Error("Only HTML snapshots have a data timestamp")
    if (
      dataTimestamp !== null &&
      (!Number.isSafeInteger(dataTimestamp) ||
        dataTimestamp < 0 ||
        dataTimestamp > Date.now())
    )
      throw new Error("Data timestamp must be a valid past date")
    await ctx.db.patch(artifactId, {
      dataTimestamp: dataTimestamp ?? undefined,
    })
    return null
  },
})
