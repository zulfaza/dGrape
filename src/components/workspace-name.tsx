import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"

type WorkspaceNameState = {
  name: string | null
  setName: (name: string | null) => void
}

const WorkspaceNameContext = createContext<WorkspaceNameState>({
  name: null,
  setName: () => {},
})

/**
 * Carries the open workspace's name up to the dashboard header.
 *
 * The workspace layout already loads the workspace, so the breadcrumb reads
 * the name from here instead of running a second query that could fail
 * outside the workspace's error boundary.
 */
export function WorkspaceNameProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null>(null)
  return (
    <WorkspaceNameContext.Provider value={{ name, setName }}>
      {children}
    </WorkspaceNameContext.Provider>
  )
}

export function useWorkspaceName(): string | null {
  return useContext(WorkspaceNameContext).name
}

/** Publishes `name` while the caller is mounted. */
export function usePublishWorkspaceName(name: string | undefined) {
  const { setName } = useContext(WorkspaceNameContext)
  useEffect(() => {
    if (name === undefined) return
    setName(name)
    return () => setName(null)
  }, [name, setName])
}
