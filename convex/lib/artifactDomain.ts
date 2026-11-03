import { v, type Infer } from "convex/values"
import type { Id } from "../_generated/dataModel"
import type { Checked } from "./collectionDomain"

/**
 * Artifacts: private files of a workspace, stored in Cloudflare R2. Convex
 * keeps their metadata and provenance. A file is uploaded in two steps, so
 * the bytes go straight to R2 and never through Convex:
 *
 * 1. Create an upload: the server picks the object key and returns a signed
 *    PUT URL that expires in 15 minutes.
 * 2. Complete the upload: the server reads the object's size and type from
 *    R2, and records the artifact. A file over MAX_ARTIFACT_BYTES is deleted.
 *
 * Downloads use signed GET URLs on the R2 origin, so a file never runs with
 * the app's cookies or origin.
 */

export const MAX_ARTIFACT_BYTES = 25 * 1024 * 1024
export const UPLOAD_WINDOW_MS = 15 * 60 * 1000
/** Seconds that a signed download URL stays valid. */
export const DOWNLOAD_URL_SECONDS = 5 * 60
const MAX_NAME_LENGTH = 200

/** Who created an artifact. */
export const artifactCreatorValidator = v.union(
  v.object({ kind: v.literal("user"), userId: v.string() }),
  v.object({ kind: v.literal("agent"), grantId: v.id("agentGrants") })
)

export type ArtifactCreator = Infer<typeof artifactCreatorValidator>

export const artifactValidator = v.object({
  _id: v.id("artifacts"),
  _creationTime: v.number(),
  workspaceId: v.id("workspaces"),
  key: v.string(),
  name: v.string(),
  contentType: v.string(),
  size: v.number(),
  createdBy: artifactCreatorValidator,
})

/** The R2 key for a new object. Keys never reuse user input. */
export function newObjectKey(workspaceId: Id<"workspaces">) {
  return `workspaces/${workspaceId}/${crypto.randomUUID()}`
}

/** Trims a file name and checks its length and characters. */
export function checkArtifactName(name: string): Checked<string> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH)
    return {
      ok: false,
      message: `Name must be between 1 and ${MAX_NAME_LENGTH} characters`,
    }
  if (
    /[/\\]/.test(trimmed) ||
    [...trimmed].some((char) => (char.codePointAt(0) ?? 0) < 0x20)
  )
    return {
      ok: false,
      message: "Name cannot contain slashes or control characters",
    }
  return { ok: true, value: trimmed }
}
