import { useNavigate } from "@tanstack/react-router"
import { useMutation } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { toast } from "./ui/toast"
import { errorMessage } from "@/lib/error-message"

/**
 * Creates an empty dashboard in `workspaceId` and opens it in edit mode.
 * `pending` is true while the dashboard is created.
 */
export function useNewDashboard(workspaceId: Id<"workspaces">) {
  const save = useMutation(api.pages.save)
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  async function create() {
    if (pending) return
    setPending(true)
    try {
      const { pageId } = await save({
        workspaceId,
        definition: { title: "Untitled dashboard", blocks: [] },
      })
      await navigate({
        to: "/dashboard/workspaces/$workspaceId/pages/$pageId",
        params: { workspaceId, pageId },
        search: { edit: true },
      })
    } catch (error) {
      toast.error(
        errorMessage(error, "Try again."),
        "Could not create the dashboard"
      )
    } finally {
      setPending(false)
    }
  }
  return { create: () => void create(), pending }
}
