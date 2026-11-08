import * as React from "react"
import {
  ChevronDown,
  ChevronRight,
  LayoutGrid,
  Plus,
  Settings,
} from "lucide-react"
import { Link, useParams, useRouterState } from "@tanstack/react-router"
import { useConvexAuth, usePaginatedQuery } from "convex/react"
import type { User } from "@workos/authkit-tanstack-react-start"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { WorkspaceRole } from "../../convex/lib/workspaceRoles"
import { settingsSegment } from "@/components/settings-nav"

import { NavUser } from "@/components/nav-user"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useNewDashboard } from "@/components/new-dashboard"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const ACTIVE_LINK_PROPS = { "data-active": true }

type WorkspaceRow = { _id: Id<"workspaces">; name: string; role: WorkspaceRole }

/**
 * Two modes, as in Sentry: the dashboards tree (each workspace with its
 * dashboards) and, on a settings route, the settings of one workspace.
 */
export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: User
}) {
  const name =
    user.name || [user.firstName, user.lastName].filter(Boolean).join(" ")
  const { workspaceId, pageId } = useParams({ strict: false })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  // Queries need the Convex session, which arrives after hydration.
  const { isAuthenticated } = useConvexAuth()
  const workspaces = usePaginatedQuery(
    api.workspaces.list,
    isAuthenticated ? {} : "skip",
    { initialNumItems: 20 }
  )
  const settingsWorkspace = workspaceId ?? workspaces.results[0]?._id
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <img
                  src="/favicon.svg"
                  alt=""
                  className="size-8 shrink-0"
                  width={32}
                  height={32}
                />
                <span className="text-xl font-semibold tracking-tight">
                  DFE
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <DashboardsNav
          loading={workspaces.status === "LoadingFirstPage"}
          workspaces={workspaces.results}
          loadMore={
            workspaces.status === "CanLoadMore"
              ? () => workspaces.loadMore(20)
              : null
          }
          currentWorkspaceId={workspaceId}
          currentPageId={pageId}
        />
      </SidebarContent>
      <SidebarFooter>
        {settingsWorkspace && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Settings"
                isActive={settingsSegment(pathname) !== null}
              >
                <Link
                  to="/dashboard/workspaces/$workspaceId/data"
                  params={{ workspaceId: settingsWorkspace }}
                >
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <NavUser
          user={{
            name: name || user.email,
            email: user.email,
            avatar: user.profilePictureUrl || "",
          }}
        />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

/** Every workspace, each with the dashboards it holds. */
function DashboardsNav({
  loading,
  workspaces,
  loadMore,
  currentWorkspaceId,
  currentPageId,
}: {
  loading: boolean
  workspaces: ReadonlyArray<WorkspaceRow>
  /** Loads the next page of workspaces, or null when all are loaded. */
  loadMore: (() => void) | null
  currentWorkspaceId: string | undefined
  currentPageId: string | undefined
}) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Dashboards</SidebarGroupLabel>
      <SidebarMenu>
        {loading &&
          Array.from({ length: 3 }, (_, index) => (
            <SidebarMenuItem key={index}>
              <SidebarMenuSkeleton />
            </SidebarMenuItem>
          ))}
        {workspaces.map((workspace) => (
          <WorkspaceTree
            key={workspace._id}
            workspace={workspace}
            current={workspace._id === currentWorkspaceId}
            currentPageId={currentPageId}
          />
        ))}
        {loadMore && (
          <SidebarMenuItem>
            <SidebarMenuButton onClick={loadMore}>
              <ChevronDown />
              <span>More workspaces</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
        <SidebarMenuItem>
          <SidebarMenuButton asChild>
            <Link
              to="/dashboard/workspaces"
              activeProps={ACTIVE_LINK_PROPS}
              activeOptions={{ exact: true }}
            >
              <LayoutGrid />
              <span>All workspaces</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}

function WorkspaceTree({
  workspace,
  current,
  currentPageId,
}: {
  workspace: WorkspaceRow
  current: boolean
  currentPageId: string | undefined
}) {
  const pages = usePaginatedQuery(
    api.pages.list,
    { workspaceId: workspace._id },
    { initialNumItems: 10 }
  )
  const canWrite = workspace.role !== "viewer"
  const newDashboard = useNewDashboard(workspace._id)
  return (
    <Collapsible asChild defaultOpen className="group/tree">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={workspace.name}>
            <ChevronRight className="transition-transform group-data-[state=open]/tree:rotate-90 motion-reduce:transition-none" />
            <span className={current ? "font-semibold" : undefined}>
              {workspace.name}
            </span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            {pages.results.map((page) => (
              <SidebarMenuSubItem key={page._id}>
                <SidebarMenuSubButton
                  asChild
                  isActive={page._id === currentPageId}
                >
                  <Link
                    to="/dashboard/workspaces/$workspaceId/pages/$pageId"
                    params={{ workspaceId: workspace._id, pageId: page._id }}
                  >
                    <span title={page.title}>{page.title}</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
            {pages.status === "CanLoadMore" && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild>
                  <Link
                    to="/dashboard/workspaces/$workspaceId/pages"
                    params={{ workspaceId: workspace._id }}
                  >
                    <span>All dashboards</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
            {pages.status === "Exhausted" &&
              pages.results.length === 0 &&
              !canWrite && (
                <SidebarMenuSubItem>
                  <span className="px-2 text-sm text-sidebar-muted">
                    No dashboards yet
                  </span>
                </SidebarMenuSubItem>
              )}
            {canWrite && pages.status !== "LoadingFirstPage" && (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton asChild>
                  <button
                    type="button"
                    disabled={newDashboard.pending}
                    onClick={newDashboard.create}
                  >
                    <Plus />
                    <span className="text-sidebar-muted">New dashboard</span>
                  </button>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}
