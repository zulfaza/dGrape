import { createFileRoute } from "@tanstack/react-router"
import { Authenticated, Unauthenticated } from "convex/react"
import { useAuth } from "@workos/authkit-tanstack-react-start/client"
import { getAuth } from "@workos/authkit-tanstack-react-start"
import { convexQuery } from "@convex-dev/react-query"
import { useSuspenseQuery } from "@tanstack/react-query"
import { api } from "../../convex/_generated/api"

export const Route = createFileRoute("/")({
  component: Home,
  loader: async () => {
    const { user } = await getAuth()
    return { user }
  },
})

function Home() {
  const { user } = Route.useLoaderData()
  const { signOut } = useAuth()

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1>Convex + TanStack Start + WorkOS</h1>
        {user ? (
          <button onClick={() => signOut()}>Sign out</button>
        ) : (
          <div className="flex gap-2">
            <a href="/sign-in">
              <button>Sign in</button>
            </a>
            <a href="/sign-up">
              <button>Sign up</button>
            </a>
          </div>
        )}
      </div>
      <Authenticated>
        <Content />
      </Authenticated>
      <Unauthenticated>
        <p>Please sign in to view data</p>
      </Unauthenticated>
    </div>
  )
}

function Content() {
  const { data } = useSuspenseQuery(
    convexQuery(api.myFunctions.listNumbers, { count: 10 })
  )

  return (
    <div>
      <p>Welcome {data.viewer}!</p>
      <p>Numbers: {data.numbers?.join(", ") || "None"}</p>
    </div>
  )
}
