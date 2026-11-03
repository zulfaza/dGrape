// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { convexTest } from "convex-test"
import schema from "../../convex/schema"
import {
  WorkspaceConnectionsView,
  type WorkspaceConnectionService,
} from "./workspace-connections"

function service(
  secrets: WorkspaceConnectionService["secrets"],
  connections: WorkspaceConnectionService["connections"]
): WorkspaceConnectionService {
  const unavailable = async (): Promise<never> => {
    throw new Error("Command unavailable in list tests")
  }
  return {
    secrets,
    connections,
    prepare: unavailable,
    rotate: unavailable,
    beginDelete: unavailable,
    createConnection: unavailable,
    createGithubConnection: unavailable,
    removeConnection: unavailable,
    update: unavailable,
  }
}
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

async function workspaceId() {
  const t = convexTest(schema, import.meta.glob("../../convex/**/*.ts"))
  return t.run((ctx) => ctx.db.insert("workspaces", { name: "Settings" }))
}

it("loads both lists when filtered pages contain no visible rows", async () => {
  const credentials = vi.fn<(numItems: number) => void>()
  const connections = vi.fn<(numItems: number) => void>()
  const lists = service(
    {
      results: [],
      status: "CanLoadMore",
      isLoading: false,
      loadMore: credentials,
    },
    {
      results: [],
      status: "CanLoadMore",
      isLoading: false,
      loadMore: connections,
    }
  )
  render(
    <WorkspaceConnectionsView
      workspaceId={await workspaceId()}
      service={lists}
    />
  )
  fireEvent.click(screen.getByRole("button", { name: "Load more credentials" }))
  fireEvent.click(screen.getByRole("button", { name: "Load more connections" }))
  expect(credentials).toHaveBeenCalledExactlyOnceWith(20)
  expect(connections).toHaveBeenCalledExactlyOnceWith(20)
})

it("disables loading controls and removes them when both lists end", async () => {
  const loadMore = vi.fn<(numItems: number) => void>()
  const lists = service(
    { results: [], status: "LoadingMore", isLoading: true, loadMore },
    { results: [], status: "LoadingMore", isLoading: true, loadMore }
  )
  const id = await workspaceId()
  const view = render(
    <WorkspaceConnectionsView workspaceId={id} service={lists} />
  )
  for (const name of ["Loading credentials…", "Loading connections…"]) {
    const button = screen.getByRole("button", { name })
    expect(button.getAttribute("disabled")).toBe("")
    fireEvent.click(button)
  }
  expect(loadMore).not.toHaveBeenCalled()
  const ended = service(
    { results: [], status: "Exhausted", isLoading: false, loadMore },
    { results: [], status: "Exhausted", isLoading: false, loadMore }
  )
  view.rerender(<WorkspaceConnectionsView workspaceId={id} service={ended} />)
  expect(screen.queryByRole("button", { name: /Load more|Loading/ })).toBeNull()
})
