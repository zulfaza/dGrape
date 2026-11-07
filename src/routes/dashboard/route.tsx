import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { useConvexAuth } from "convex/react"
import { Fragment, type ReactNode } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { LoadingPage } from "@/components/loading-rows"
import { NotFound } from "@/components/not-found"
import {
  useWorkspaceName,
  WorkspaceNameProvider,
} from "@/components/workspace-name"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { getAuth, getSignInUrl } from "@workos/authkit-tanstack-react-start"

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
  notFoundComponent: () => <NotFound />,
  loader: async ({ location }) => {
    const { user } = await getAuth()
    if (!user) {
      const path = location.pathname
      const href = await getSignInUrl({ data: { returnPathname: path } })
      throw redirect({ href })
    }
    return { user }
  },
})

function DashboardLayout() {
  const { user } = Route.useLoaderData()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  return (
    <WorkspaceNameProvider>
      <SidebarProvider>
        <AppSidebar user={user} />
        <SidebarInset className="h-svh min-h-0 overflow-x-hidden">
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-card">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator
                orientation="vertical"
                className="mr-2 data-[orientation=vertical]:h-4"
              />
              <DashboardBreadcrumbs pathname={pathname} />
            </div>
          </header>
          <ConvexAuthGate pathname={pathname}>
            <Outlet />
          </ConvexAuthGate>
        </SidebarInset>
      </SidebarProvider>
    </WorkspaceNameProvider>
  )
}

function DashboardBreadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = buildBreadcrumbs(pathname, useWorkspaceName())
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1
          return (
            <Fragment key={crumb.href}>
              <BreadcrumbItem className="min-w-0">
                {isLast ? (
                  <BreadcrumbPage>
                    <span className="block max-w-56 truncate">
                      {crumb.label}
                    </span>
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.href}>
                      <span className="block max-w-56 truncate">
                        {crumb.label}
                      </span>
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}

/**
 * Renders dashboard pages only after Convex accepts the WorkOS token.
 *
 * On a full page load, AuthKit gets the session from the server after
 * hydration. Queries that start before that run without a token and fail
 * with "Unauthenticated", so the pages must wait for this gate.
 */
function ConvexAuthGate({
  pathname,
  children,
}: {
  pathname: string
  children: ReactNode
}) {
  const { isLoading, isAuthenticated } = useConvexAuth()
  if (isAuthenticated) return children
  if (isLoading) {
    return <LoadingPage label="Loading" />
  }
  return (
    <main className="p-6">
      Your session ended.{" "}
      <a
        className="underline"
        href={`/sign-in?returnPathname=${encodeURIComponent(pathname)}`}
      >
        Sign in again
      </a>
      .
    </main>
  )
}

const WORKSPACE_SECTION_TITLES = new Map([
  ["pages", "Dashboards"],
  ["data", "Collections"],
  ["jobs", "Jobs"],
  ["connections", "Connections"],
  ["artifacts", "Files"],
  ["members", "Members"],
  ["activity", "Activity"],
  ["usage", "Usage"],
])

type Crumb = { label: string; href: string }

/**
 * Breadcrumbs for the two sidebar modes: "Settings / workspace / section"
 * on a settings page, and "workspace / Dashboard" on a dashboard.
 */
function buildBreadcrumbs(
  pathname: string,
  workspaceName: string | null
): Crumb[] {
  if (!pathname.startsWith("/dashboard/workspaces/"))
    return [{ label: "Workspaces", href: "/dashboard/workspaces" }]
  const [workspaceId, section, pageId] = pathname
    .slice("/dashboard/workspaces/".length)
    .split("/")
  const workspaceHref = `/dashboard/workspaces/${workspaceId}`
  const workspace = { label: workspaceName ?? "Workspace", href: workspaceHref }
  if (section === "pages" && pageId)
    return [workspace, { label: "Dashboard", href: pathname }]
  const sectionTitle = section && WORKSPACE_SECTION_TITLES.get(section)
  if (!sectionTitle) return [workspace]
  return [
    { label: "Settings", href: `${workspaceHref}/data` },
    workspace,
    { label: sectionTitle, href: `${workspaceHref}/${section}` },
  ]
}
