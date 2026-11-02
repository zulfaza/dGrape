import { useAction, useMutation, usePaginatedQuery } from "convex/react"
import { Component, useState, type FormEvent, type ReactNode } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { AgentScope } from "../../convex/lib/agentScope"
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
        <section>
          <p role="alert">Could not load credentials.</p>
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
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Agent access</h2>
      <p>
        Credentials let an agent read this workspace, or also create collections
        and write records. Each credential expires after the selected number of
        days.
      </p>
      <p>
        Connect an MCP client to /mcp, or open a collection to copy its HTTP API
        URL. Send the credential in the Authorization header as Bearer followed
        by a space and the credential.
      </p>
      {token ? (
        <div className="flex flex-col gap-2">
          <p>Copy this credential now. You cannot see it again.</p>
          <code className="break-all">{token}</code>
          <p>To connect Claude Code through MCP, run:</p>
          <code className="break-all">{mcpCommand(token)}</code>
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
              Copy
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setToken(null)}
            >
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Label htmlFor="grant-days">Duration in days (1–30)</Label>
          <Input
            id="grant-days"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            disabled={saving}
            inputMode="numeric"
          />
          <Label htmlFor="grant-scope">Access</Label>
          <Select
            value={scope}
            disabled={saving}
            onValueChange={(value) => {
              if (value === "readonly" || value === "readwrite") setScope(value)
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
          <Button type="submit" disabled={saving}>
            Create credential
          </Button>
        </form>
      )}
      {status === "LoadingFirstPage" ? (
        <p role="status">Loading credentials…</p>
      ) : results.length === 0 ? (
        <p>No credentials yet.</p>
      ) : null}
      <ul>
        {results.map((grant) => (
          <li key={grant._id} className="flex items-center gap-2">
            <span>
              {SCOPE_LABELS[grant.scope]} · Created{" "}
              {new Date(grant._creationTime).toLocaleDateString()} · Expires{" "}
              {new Date(grant.expiresAt).toLocaleDateString()} ·{" "}
              {grant.state === "revoked"
                ? "Revoked"
                : grant.expiresAt <= Date.now()
                  ? "Expired"
                  : "Active"}
            </span>
            {grant.state === "active" && grant.expiresAt > Date.now() && (
              <Button
                variant="outline"
                disabled={saving || token !== null}
                onClick={() => remove(grant._id)}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
      {status === "CanLoadMore" && (
        <Button variant="outline" onClick={() => loadMore(20)}>
          Load more
        </Button>
      )}
    </section>
  )
}
