import { useAction, useMutation, usePaginatedQuery } from "convex/react"
import { Component, useState, type FormEvent, type ReactNode } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { AgentScope } from "../../convex/lib/agentScope"
import { Mascot } from "@/components/mascot"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "@/components/ui/toast"

export class AgentAccessBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4">
          <p role="alert" className="text-sm">
            Could not load credentials.
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ failed: false })}
          >
            Retry
          </Button>
        </section>
      )
    }
    return this.props.children
  }
}

const SCOPE_LABELS: Record<AgentScope, string> = {
  readonly: "Read only",
  readwrite: "Read and write",
}

/** The Claude Code command that connects this app's `/mcp` endpoint. */
function mcpCommand(token: string) {
  return `claude mcp add --transport http dfe ${window.location.origin}/mcp --header "Authorization: Bearer ${token}"`
}

export function AgentAccess({
  workspaceId,
}: {
  workspaceId: Id<"workspaces">
}) {
  const create = useAction(api.agentAccess.create)
  const revoke = useMutation(api.agentGrants.revoke)
  const { results, status, loadMore } = usePaginatedQuery(
    api.agentGrants.list,
    { workspaceId },
    { initialNumItems: 20 }
  )
  const [days, setDays] = useState("30")
  const [scope, setScope] = useState<AgentScope>("readonly")
  const [token, setToken] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const duration = Number(days)
    if (
      !days.trim() ||
      !Number.isFinite(duration) ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 30
    ) {
      toast.error("Enter 1 to 30 days")
      return
    }
    if (saving) return
    setSaving(true)
    try {
      setToken(await create({ workspaceId, days: duration, scope }))
    } catch {
      toast.error("Could not create credential")
    } finally {
      setSaving(false)
    }
  }
  async function remove(grantId: Id<"agentGrants">) {
    if (saving) return
    setSaving(true)
    try {
      await revoke({ workspaceId, grantId })
      toast.success("Credential revoked")
    } catch {
      toast.error("Could not revoke credential")
    } finally {
      setSaving(false)
    }
  }
  const now = Date.now()
  return (
    <aside
      aria-labelledby="agent-access-heading"
      className="flex flex-col gap-4"
    >
      <div className="flex gap-3 rounded-xl bg-mascot-surface p-4 text-foreground">
        <Mascot pose="laptop" size={72} className="-my-1" />
        <div className="flex flex-col gap-1">
          <h2 id="agent-access-heading" className="text-base font-semibold">
            Connect your agent
          </h2>
          <p className="text-sm">
            Keep your current agent. Give it a credential, and it can read this
            workspace, or also create collections and write records, through MCP
            or the HTTP API.
          </p>
        </div>
      </div>
      {token ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <Mascot pose="celebrate" size={56} />
            <p className="text-sm font-medium">
              Copy this credential now. You cannot see it again.
            </p>
          </div>
          <code className="rounded-sm bg-muted p-2 text-xs break-all">
            {token}
          </code>
          <p className="text-sm text-muted-foreground">
            To connect Claude Code, run:
          </p>
          <code className="rounded-sm bg-muted p-2 text-xs break-all">
            {mcpCommand(token)}
          </code>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(token)
                  toast.success("Credential copied")
                } catch {
                  toast.error("Could not copy credential")
                }
              }}
            >
              Copy credential
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setToken(null)}
            >
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-lg border bg-card p-4"
        >
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="grid gap-2">
              <Label htmlFor="grant-scope">Access</Label>
              <Select
                value={scope}
                disabled={saving}
                onValueChange={(value) => {
                  if (value === "readonly" || value === "readwrite")
                    setScope(value)
                }}
              >
                <SelectTrigger id="grant-scope" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="readonly">
                      {SCOPE_LABELS.readonly}
                    </SelectItem>
                    <SelectItem value="readwrite">
                      {SCOPE_LABELS.readwrite}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="grant-days">Days</Label>
              <Input
                id="grant-days"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                disabled={saving}
                inputMode="numeric"
                aria-describedby="grant-days-help"
              />
            </div>
          </div>
          <p id="grant-days-help" className="text-sm text-muted-foreground">
            The credential expires after 1 to 30 days.
          </p>
          <Button type="submit" disabled={saving}>
            {saving ? "Creating…" : "Create credential"}
          </Button>
        </form>
      )}
      <section
        aria-labelledby="credentials-heading"
        className="flex flex-col gap-2"
      >
        <h3 id="credentials-heading" className="text-sm font-semibold">
          Credentials
        </h3>
        {status === "LoadingFirstPage" ? (
          <p role="status" className="text-sm text-muted-foreground">
            Loading credentials…
          </p>
        ) : results.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credentials yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {results.map((grant) => {
              const active = grant.state === "active" && grant.expiresAt > now
              return (
                <li
                  key={grant._id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {SCOPE_LABELS[grant.scope]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {active
                        ? `Expires ${new Date(grant.expiresAt).toLocaleDateString()}`
                        : `Created ${new Date(grant._creationTime).toLocaleDateString()}`}
                    </span>
                  </div>
                  {active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving || token !== null}
                      onClick={() => remove(grant._id)}
                    >
                      Revoke
                    </Button>
                  ) : (
                    <Badge variant="secondary">
                      {grant.state === "revoked" ? "Revoked" : "Expired"}
                    </Badge>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {status === "CanLoadMore" && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => loadMore(20)}
          >
            Load more
          </Button>
        )}
      </section>
    </aside>
  )
}
