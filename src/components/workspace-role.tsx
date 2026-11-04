import { createContext, useContext, type ReactNode } from "react"
import {
  roleAllows,
  type WorkspaceAccess,
  type WorkspaceRole,
} from "../../convex/lib/workspaceRoles"

/**
 * The signed-in user's role in the open workspace. The workspace layout
 * provides it. The server checks every operation; this only hides controls
 * that the role cannot use.
 */
const WorkspaceRoleContext = createContext<WorkspaceRole | null>(null)

export function WorkspaceRoleProvider({
  role,
  children,
}: {
  role: WorkspaceRole | null
  children: ReactNode
}) {
  return (
    <WorkspaceRoleContext.Provider value={role}>
      {children}
    </WorkspaceRoleContext.Provider>
  )
}

/** The role, or null while it loads. */
export function useWorkspaceRole() {
  return useContext(WorkspaceRoleContext)
}

/** True when the role gives `access`. False while the role loads. */
export function useWorkspaceCan(access: WorkspaceAccess) {
  const role = useWorkspaceRole()
  return role !== null && roleAllows(role, access)
}

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  editor: "Editor",
  viewer: "Viewer",
}
