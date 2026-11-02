import { createFileRoute, Link } from "@tanstack/react-router"
import { useMutation, usePaginatedQuery } from "convex/react"
import { useState, type FormEvent } from "react"
import { toast } from "@/components/ui/toast"
import { api } from "../../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export const Route = createFileRoute("/dashboard/workspaces")({
  component: WorkspacesPage,
  errorComponent: () => (
    <main className="p-6">Could not load workspaces. Please try again.</main>
  ),
})

function WorkspacesPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.workspaces.list,
    {},
    { initialNumItems: 20 }
  )
  const create = useMutation(api.workspaces.create)
  const [name, setName] = useState("")
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !name.trim() || name.trim().length > 100) return
    setSaving(true)
    try {
      await create({ name })
      setName("")
      setOpen(false)
      toast.success("Workspace created")
    } catch {
      toast.error("Could not create workspace")
    } finally {
      setSaving(false)
    }
  }
  return (
    <main className="flex flex-1 flex-col gap-6 p-4 md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your workspaces.</p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(nextOpen) => {
            if (!saving) setOpen(nextOpen)
          }}
        >
          <DialogTrigger asChild>
            <Button>Create workspace</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create workspace</DialogTitle>
              <DialogDescription>Give your workspace a name.</DialogDescription>
            </DialogHeader>
            <form onSubmit={submit}>
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="workspace-name">Name</Label>
                  <Input
                    id="workspace-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    maxLength={100}
                    disabled={saving}
                    aria-describedby="workspace-name-help"
                    required
                  />
                  <p
                    id="workspace-name-help"
                    className="text-sm text-muted-foreground"
                  >
                    Enter 1 to 100 characters.
                  </p>
                </div>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? "Creating…" : "Create workspace"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading workspaces…</p>
      ) : results.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No workspaces yet. Create one to get started.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((workspace) => (
            <li
              key={workspace._id}
              className="rounded-lg border bg-card p-4 font-medium"
            >
              <Link
                to="/dashboard/workspaces/$workspaceId"
                params={{ workspaceId: workspace._id }}
                className="block"
              >
                {workspace.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Load more
        </Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more…</p>}
    </main>
  )
}
