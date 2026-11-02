import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { Fragment } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { NotFound } from "@/components/not-found"
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
  const crumbs = buildBreadcrumbs(pathname)
  return (
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
            <Breadcrumb>
              <BreadcrumbList>
                {crumbs.map((crumb, index) => {
                  const isLast = index === crumbs.length - 1
                  return (
                    <Fragment key={crumb.href}>
                      <BreadcrumbItem>
                        {isLast ? (
                          <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.href}>{crumb.label}</Link>
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                      {!isLast && <BreadcrumbSeparator />}
                    </Fragment>
                  )
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <Outlet />
      </SidebarInset>
    </SidebarProvider>
  )
}

const DASHBOARD_PAGE_TITLES: Record<string, string> = {
  "/dashboard/workspaces": "Workspaces",
}

type Crumb = { label: string; href: string }

function buildBreadcrumbs(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: "Dashboard", href: "/dashboard" }]
  if (pathname !== "/dashboard" && DASHBOARD_PAGE_TITLES[pathname]) {
    crumbs.push({ label: DASHBOARD_PAGE_TITLES[pathname], href: pathname })
  } else if (pathname.startsWith("/dashboard/workspaces/")) {
    crumbs.push(
      { label: "Workspaces", href: "/dashboard/workspaces" },
      { label: "Workspace", href: pathname }
    )
  }
  return crumbs
}
