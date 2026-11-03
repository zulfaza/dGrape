import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/dashboard/workspaces_/$workspaceId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/dashboard/workspaces/$workspaceId/data",
      params,
    })
  },
})
