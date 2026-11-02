import { useAction, useMutation, usePaginatedQuery } from "convex/react"
import { Component, useState, type FormEvent, type ReactNode } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
      setToken(await create({ workspaceId, days: duration }))
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
        Credentials allow read-only access to records in this workspace. Each
        credential expires after the selected number of days.
      </p>
      <p>
        Open a collection to copy its API URL. Send the credential in the
        Authorization header as Bearer followed by a space and the credential.
      </p>
      {token ? (
        <div className="flex flex-col gap-2">
          <p>Copy this credential now. You cannot see it again.</p>
          <code className="break-all">{token}</code>
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
          <Button type="submit" disabled={saving}>
            Create readonly credential
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
              Created {new Date(grant._creationTime).toLocaleDateString()} ·
              Expires {new Date(grant.expiresAt).toLocaleDateString()} ·{" "}
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
