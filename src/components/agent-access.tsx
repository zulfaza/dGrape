import { useAction, useMutation, usePaginatedQuery } from "convex/react"
import { Component, useState, type FormEvent, type ReactNode } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { SCOPE_PRESETS, type AgentScope } from "../../convex/lib/agentScope"
import { Mascot } from "@/components/mascot"
import { ScopePicker, scopeSummary } from "@/components/scope-picker"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ConfirmButton } from "@/components/confirm-dialog"
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
  const [scopes, setScopes] = useState<Array<AgentScope>>([
    ...SCOPE_PRESETS.readonly,
  ])
  const [token, setToken] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const duration = Number(days)
    if (!Number.isInteger(duration) || duration < 1 || duration > 30) {
      toast.error("Enter 1 to 30 days")
      return
    }
    if (scopes.length === 0) {
      toast.error("Choose at least one scope")
      return
    }
    if (saving) return
    setSaving(true)
    try {
      setToken(await create({ workspaceId, days: duration, scopes }))
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
  const isActive = (grant: (typeof results)[number]) =>
    grant.state === "active" && grant.expiresAt > now
  const inactive = results.filter((grant) => !isActive(grant)).length
  const shown = showInactive ? results : results.filter(isActive)
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
            Give your agent a credential to use this workspace through MCP or
            the HTTP API.
          </p>
        </div>
      </div>
      {token ? (
        <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <div className="flex items-center gap-3">
            <Mascot pose="celebrate" size={56} />
            <p className="text-sm font-medium">
              Copy this credential now. You cannot see it again. Anyone who has
              it gets this access.
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
              I saved it
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 rounded-lg border bg-card p-4"
        >
          <ScopePicker
            id="grant-scope"
            value={scopes}
            onChange={setScopes}
            disabled={saving}
          />
          <div className="grid gap-2">
            <Label htmlFor="grant-days">Expires after</Label>
            <div className="flex items-center gap-2">
              <Input
                id="grant-days"
                type="number"
                min={1}
                max={30}
                required
                className="w-24"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                disabled={saving}
              />
              <span className="text-sm text-muted-foreground">
                days (1 to 30)
              </span>
            </div>
          </div>
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
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No active credentials.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {shown.map((grant) => {
              const active = isActive(grant)
              return (
                <li
                  key={grant._id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium">
                      {scopeSummary(grant.scopes)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Created{" "}
                      {new Date(grant._creationTime).toLocaleDateString()}
                      {active &&
                        ` · expires ${new Date(grant.expiresAt).toLocaleDateString()}`}
                    </span>
                  </div>
                  {active ? (
                    <ConfirmButton
                      variant="outline"
                      size="sm"
                      disabled={saving || token !== null}
                      title="Revoke this credential?"
                      description="Agents that use it lose access at once."
                      confirmLabel="Revoke"
                      destructive
                      onConfirm={() => void remove(grant._id)}
                    >
                      Revoke
                    </ConfirmButton>
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
        {inactive > 0 && (
          <Button
            variant="link"
            size="sm"
            className="-ml-3 self-start text-muted-foreground"
            onClick={() => setShowInactive(!showInactive)}
          >
            {showInactive
              ? "Hide revoked and expired"
              : `Show ${inactive} revoked or expired`}
          </Button>
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
