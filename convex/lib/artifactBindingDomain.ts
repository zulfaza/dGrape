import { v } from "convex/values"
export const artifactRelation = v.union(
  v.literal("attachment"),
  v.literal("report"),
  v.literal("image")
)
export const bindingFields = {
  recordId: v.id("collectionRecords"),
  artifactId: v.id("artifacts"),
  relation: artifactRelation,
}
export function supportsRelation(
  type: string,
  relation: "attachment" | "report" | "image"
) {
  const mime = type.split(";")[0]?.trim().toLowerCase()
  if (relation === "attachment") return true
  if (relation === "image")
    return ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
      mime ?? ""
    )
  return [
    "application/pdf",
    "application/json",
    "text/plain",
    "text/csv",
  ].includes(mime ?? "")
}
