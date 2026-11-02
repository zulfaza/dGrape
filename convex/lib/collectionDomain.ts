import { v } from "convex/values"

export const collectionFieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  type: v.union(v.literal("text"), v.literal("number"), v.literal("boolean")),
})
