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
        title: "dGrape",
      },
      {
        name: "description",
        content:
          "AI-assisted job tracker for tracking applications, tailoring resumes, and learning from outcomes.",
      },
      {
        property: "og:title",
        content: "dGrape - Job Search OS",
      },
      {
        property: "og:description",
        content:
          "Run your job search like an OS with AI-assisted tracking and insight.",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        property: "og:image",
        content: "/og-image.png",
      },
      {
        property: "og:image:width",
        content: "1200",
      },
      {
        property: "og:image:height",
        content: "630",
      },
      {
        property: "og:image:alt",
        content: "dGrape job tracker preview",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "dGrape - Job Search OS",
      },
      {
        name: "twitter:description",
        content:
          "Run your job search like an OS with AI-assisted tracking and insight.",
      },
      {
        name: "twitter:image",
        content: "/og-image.png",
      },
      {
        name: "twitter:image:alt",
        content: "dGrape job tracker preview",
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
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
