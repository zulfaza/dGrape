import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/react-router"
import { getAuth } from "@workos/authkit-tanstack-react-start"
import appCssUrl from "../app.css?url"
import type { QueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"
import type { ConvexReactClient } from "convex/react"
import type { ConvexQueryClient } from "@convex-dev/react-query"

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
  convexClient: ConvexReactClient
  convexQueryClient: ConvexQueryClient
}>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Convex + TanStack Start + WorkOS AuthKit",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCssUrl },
      { rel: "icon", href: "/convex.svg" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1>404</h1>
      <p>The requested page could not be found.</p>
    </main>
  ),
  beforeLoad: async (ctx) => {
    const auth = await getAuth()

    // During SSR only (the only time serverHttpClient exists),
    // set the WorkOS auth token to make HTTP queries with.
    if (auth.user) {
      ctx.context.convexQueryClient.serverHttpClient?.setAuth(auth.accessToken)
    }

    return { user: auth.user }
  },
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
