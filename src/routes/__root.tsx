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
import { Toaster } from "@/components/ui/toast"
import { NotFound } from "@/components/not-found"

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
        title: "DFE — Dashboard for Everything",
      },
      {
        name: "description",
        content:
          "Dashboard for Everything: an agent-first workspace for data, recipes, artifacts, and reports.",
      },
      {
        property: "og:title",
        content: "DFE — Dashboard for Everything",
      },
      {
        property: "og:description",
        content:
          "An agent-first workspace for data, recipes, artifacts, and reports at dfe.makarima.dev.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary",
      },
      {
        name: "twitter:title",
        content: "DFE — Dashboard for Everything",
      },
      {
        name: "twitter:description",
        content:
          "An agent-first workspace for data, recipes, artifacts, and reports at dfe.makarima.dev.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCssUrl },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => <NotFound homeHref="/" homeLabel="Back to home" />,
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
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
