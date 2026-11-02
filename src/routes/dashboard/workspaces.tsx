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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { ChevronRight, Plus } from "lucide-react"
import { Mascot } from "@/components/mascot"
import { PageHeader } from "@/components/page-header"

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
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-8 px-4 py-8 md:px-8">
      <PageHeader
        title="Workspaces"
        description="Each workspace keeps its own collections, records, and agent access."
        actions={<CreateWorkspaceDialog />}
      />
      {status === "LoadingFirstPage" ? (
        <p role="status" className="text-muted-foreground">
          Loading workspaces…
        </p>
      ) : results.length === 0 ? (
        <Empty className="rounded-xl border bg-card">
          <EmptyHeader>
            <EmptyMedia>
              <Mascot pose="wave" size={160} />
            </EmptyMedia>
            <EmptyTitle>Create your first workspace</EmptyTitle>
            <EmptyDescription>
              A workspace holds the collections you and your agent fill in, such
              as job applications or monthly spending.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateWorkspaceDialog />
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {results.map((workspace) => (
            <li key={workspace._id}>
              <Link
                to="/dashboard/workspaces/$workspaceId"
                params={{ workspaceId: workspace._id }}
                className="flex items-center justify-between gap-4 px-5 py-4 text-base font-medium outline-none first:rounded-t-lg last:rounded-b-lg hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="truncate">{workspace.name}</span>
                <ChevronRight
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {status === "CanLoadMore" && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => loadMore(20)}
        >
          Load more
        </Button>
      )}
      {status === "LoadingMore" && <p role="status">Loading more…</p>}
    </main>
  )
}

function CreateWorkspaceDialog() {
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
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) setOpen(nextOpen)
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus aria-hidden />
          Create workspace
        </Button>
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
  )
}
