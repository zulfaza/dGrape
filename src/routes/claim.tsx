import { createFileRoute, Link, redirect } from "@tanstack/react-router"
import { getAuth, getSignInUrl } from "@workos/authkit-tanstack-react-start"
import { useAction, usePaginatedQuery, useQuery } from "convex/react"
import { useState, type FormEvent } from "react"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { SCOPE_PRESETS, type AgentScope } from "../../convex/lib/agentScope"
import { Mascot } from "@/components/mascot"
import { ScopePicker } from "@/components/scope-picker"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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

/**
 * The auth.md claim page. An agent sends the user here with a claim link
 * and a 6-digit code. The user signs in with the email the agent named,
 * chooses one workspace and the scopes, and types the code. Only
 * then can the agent get a token.
 */
export const Route = createFileRoute("/claim")({
  validateSearch: (search: Record<string, unknown>) => ({
    claim_attempt_token:
      typeof search.claim_attempt_token === "string"
        ? search.claim_attempt_token
        : "",
  }),
  // The link carries a token, so do not send it to other sites.
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  loader: async ({ location }) => {
    const { user } = await getAuth()
    if (!user) {
      const href = await getSignInUrl({
        data: { returnPathname: `${location.pathname}${location.searchStr}` },
      })
      throw redirect({ href })
    }
    return { email: user.email.toLowerCase() }
  },
  component: ClaimPage,
})

type Outcome = "claimed" | null

const FAILURES = {
  unavailable:
    "This link expired or was already used. Ask your agent to start again.",
  wrong_account:
    "You are signed in with a different email from the one your agent gave. Sign in with that email.",
  wrong_code: "The code is not correct. Check the code your agent showed.",
  locked: "Too many wrong codes. Ask your agent to start again for a new code.",
  no_workspace_access: "You do not own this workspace.",
  invalid_scopes: "Choose at least one scope.",
  unverified_email: "Verify your email address, then try again.",
}

function ClaimPage() {
  const { email } = Route.useLoaderData()
  const { claim_attempt_token: attemptToken } = Route.useSearch()
  const details = useQuery(
    api.agentRegistrations.claimDetails,
    attemptToken ? { attemptToken } : "skip"
  )
  const workspaces = usePaginatedQuery(
    api.workspaces.list,
    {},
    { initialNumItems: 50 }
  )
  const confirm = useAction(api.agentRegistrations.confirmClaim)
  const [workspaceId, setWorkspaceId] = useState<Id<"workspaces"> | null>(null)
  // Read-only is the default; the user must choose more.
  const [scopes, setScopes] = useState<Array<AgentScope>>([
    ...SCOPE_PRESETS.readonly,
  ])
  const [code, setCode] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<Outcome>(null)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !workspaceId || scopes.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const result = await confirm({
        attemptToken,
        userCode: code,
        workspaceId,
        scopes,
      })
      if (result === "claimed") setOutcome("claimed")
      else setError(FAILURES[result])
    } catch {
      setError("Could not confirm. Try again.")
    } finally {
      setSaving(false)
    }
  }

  const body = (() => {
    if (outcome === "claimed")
      return (
        <>
          <h1 className="text-2xl font-semibold">Your agent is connected</h1>
          <p className="text-muted-foreground">
            Go back to your agent. It can now continue. You can revoke its
            access from the workspace page at any time.
          </p>
        </>
      )
    if (!attemptToken || details?.status === "unavailable")
      return (
        <>
          <h1 className="text-2xl font-semibold">This link cannot be used</h1>
          <p className="text-muted-foreground">{FAILURES.unavailable}</p>
        </>
      )
    if (details === undefined || workspaces.status === "LoadingFirstPage")
      return (
        <p role="status" className="text-muted-foreground">
          Loading…
        </p>
      )
    const sameAccount = details.email === email
    return (
      <>
        <h1 className="text-2xl font-semibold">Connect your agent</h1>
        <p className="text-muted-foreground">
          An agent asked for access to DFE for{" "}
          <span className="font-medium text-foreground">{details.email}</span>.
          Continue only if you started this from your own agent.
        </p>
        {!sameAccount && (
          <Alert variant="destructive">
            <AlertTitle>Different email</AlertTitle>
            <AlertDescription>
              You are signed in as {email}. {FAILURES.wrong_account}
            </AlertDescription>
          </Alert>
        )}
        {workspaces.results.length === 0 ? (
          <p>
            You have no workspace yet.{" "}
            <Link to="/dashboard/workspaces" className="underline">
              Create a workspace
            </Link>
            , then open this link again.
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <fieldset
              className="flex flex-col gap-4"
              disabled={saving || !sameAccount}
            >
              <div className="grid gap-2">
                <Label htmlFor="claim-workspace">Workspace</Label>
                <Select
                  value={workspaceId ?? ""}
                  onValueChange={(value) => {
                    const match = workspaces.results.find(
                      (w) => w._id === value
                    )
                    if (match) setWorkspaceId(match._id)
                  }}
                >
                  <SelectTrigger id="claim-workspace" className="w-full">
                    <SelectValue placeholder="Choose a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {workspaces.results.map((w) => (
                        <SelectItem key={w._id} value={w._id}>
                          {w.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <ScopePicker
                id="claim-scope"
                value={scopes}
                onChange={setScopes}
              />
              <div className="grid gap-2">
                <Label htmlFor="claim-code">Code from your agent</Label>
                <Input
                  id="claim-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  className="font-mono tracking-widest"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </fieldset>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button
              type="submit"
              disabled={
                saving || !sameAccount || !workspaceId || scopes.length === 0
              }
            >
              {saving ? "Connecting…" : "Connect agent"}
            </Button>
          </form>
        )}
      </>
    )
  })()

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <Mascot pose="wave" size={120} />
      {body}
    </main>
  )
}
