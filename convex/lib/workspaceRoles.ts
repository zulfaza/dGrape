import { v, type Infer } from "convex/values"

/**
 * The role of a workspace member.
 *
 * - owner: all access, including members, credentials, agent grants and
 *   budgets.
 * - editor: reads and changes workspace data and runs recipes.
 * - viewer: reads workspace data only.
 */
export const workspaceRoleValidator = v.union(
  v.literal("owner"),
  v.literal("editor"),
  v.literal("viewer")
)
export type WorkspaceRole = Infer<typeof workspaceRoleValidator>

/**
 * The roles an invite can give. An invite never makes an owner: an owner
 * promotes a member after they join.
 */
export const inviteRoleValidator = v.union(
  v.literal("editor"),
  v.literal("viewer")
)

/**
 * The access that one operation needs. Every membership check names one.
 *
 * - read: see workspace data.
 * - write: change workspace data, author or run recipes.
 * - manage: change members, credentials, agent grants or budgets.
 */
export type WorkspaceAccess = "read" | "write" | "manage"

/** True when `role` gives `access`. */
export function roleAllows(role: WorkspaceRole, access: WorkspaceAccess) {
  switch (role) {
    case "owner":
      return true
    case "editor":
      return access !== "manage"
    case "viewer":
      return access === "read"
  }
}
