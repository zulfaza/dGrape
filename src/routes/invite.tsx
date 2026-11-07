import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { getAuth, getSignInUrl } from "@workos/authkit-tanstack-react-start"
import { useAction } from "convex/react"
import { useState } from "react"
import { api } from "../../convex/_generated/api"
import { Mascot } from "@/components/mascot"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

/**
 * The invite page. An owner sends this link to one email address. The
 * signed-in user with that verified email joins the workspace with the
 * invited role.
 */
export const Route = createFileRoute("/invite")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
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
  component: InvitePage,
})

const FAILURES = {
  invalid:
    "This invite expired, was revoked or was already used. Ask the workspace owner for a new link.",
  wrong_account:
    "This invite is for a different email. Sign in with the invited email.",
  unverified_email: "Verify your email address, then try again.",
}

function InvitePage() {
  const { email } = Route.useLoaderData()
  const { token } = Route.useSearch()
  const accept = useAction(api.invites.accept)
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(token ? "" : FAILURES.invalid)

  async function join() {
    if (saving) return
    setSaving(true)
    setError("")
    try {
      const result = await accept({ token })
      if (result.status === "joined")
        await navigate({
          to: "/dashboard/workspaces/$workspaceId",
          params: { workspaceId: result.workspaceId },
        })
      else setError(FAILURES[result.status])
    } catch {
      setError("Could not accept the invite. Try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col justify-center gap-4 px-4 py-10">
      <Mascot pose="wave" size={120} />
      <h1 className="text-2xl font-semibold">Join a workspace</h1>
      <p className="text-muted-foreground">
        You are signed in as {email}. Accept to join the workspace that invited
        this email.
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Button disabled={saving || !token} onClick={join}>
        {saving ? "Joining…" : "Accept invite"}
      </Button>
      <p className="text-xs text-muted-foreground">
        When you join, other members of the workspace can see your email.
      </p>
      <Link to="/dashboard/workspaces" className="text-sm underline">
        Go to your workspaces
      </Link>
    </main>
  )
}
