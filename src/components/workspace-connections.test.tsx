// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useMutation, usePaginatedQuery } from "convex/react"
import { convexTest } from "convex-test"
import schema from "../../convex/schema"
import { WorkspaceConnections } from "./workspace-connections"

vi.mock("convex/react", () => ({
  useMutation: vi.fn<typeof useMutation>(),
  usePaginatedQuery: vi.fn<typeof usePaginatedQuery>(),
}))
vi.mock("@workos/authkit-tanstack-react-start/client", () => ({
  useAccessToken: () => ({
    getAccessToken: vi.fn<() => Promise<string | null>>(),
  }),
}))
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
  vi.mocked(usePaginatedQuery)
    .mockReturnValueOnce({
      results: [],
      status: "CanLoadMore",
      isLoading: false,
      loadMore: credentials,
    })
    .mockReturnValueOnce({
      results: [],
      status: "CanLoadMore",
      isLoading: false,
      loadMore: connections,
    })
  render(<WorkspaceConnections workspaceId={await workspaceId()} />)
  fireEvent.click(screen.getByRole("button", { name: "Load more credentials" }))
  fireEvent.click(screen.getByRole("button", { name: "Load more connections" }))
  expect(credentials).toHaveBeenCalledExactlyOnceWith(20)
  expect(connections).toHaveBeenCalledExactlyOnceWith(20)
})

it("disables loading controls and removes them when both lists end", async () => {
  const loadMore = vi.fn<(numItems: number) => void>()
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results: [],
    status: "LoadingMore",
    isLoading: true,
    loadMore,
  })
  const id = await workspaceId()
  const view = render(<WorkspaceConnections workspaceId={id} />)
  for (const name of ["Loading credentials…", "Loading connections…"]) {
    const button = screen.getByRole("button", { name })
    expect(button.getAttribute("disabled")).toBe("")
    fireEvent.click(button)
  }
  expect(loadMore).not.toHaveBeenCalled()
  vi.mocked(usePaginatedQuery).mockReturnValue({
    results: [],
    status: "Exhausted",
    isLoading: false,
    loadMore,
  })
  view.rerender(<WorkspaceConnections workspaceId={id} />)
  expect(screen.queryByRole("button", { name: /Load more|Loading/ })).toBeNull()
})
