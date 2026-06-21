import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
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
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const pageTitle = pathname.startsWith("/dashboard/applications/")
    ? "Application detail"
    : DASHBOARD_PAGE_TITLES[pathname] ?? "Dashboard"
  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbPage>{pageTitle}</BreadcrumbPage>
                </BreadcrumbItem>
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
  "/dashboard/applications": "Applications",
  "/dashboard/companies": "Companies",
  "/dashboard/profile": "Profile",
}
