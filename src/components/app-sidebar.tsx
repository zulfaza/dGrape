import * as React from "react"
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Database,
  FileText,
  Files,
  Gauge,
  History,
  LayoutGrid,
  Plug,
  Plus,
  Settings,
  Users,
} from "lucide-react"
import {
  Link,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router"
import { useConvexAuth, usePaginatedQuery } from "convex/react"
import type { User } from "@workos/authkit-tanstack-react-start"
import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import type { WorkspaceRole } from "../../convex/lib/workspaceRoles"

import { NavUser } from "@/components/nav-user"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ROLE_LABELS } from "@/components/workspace-role"
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

/**
 * Workspace settings, grouped as the settings sidebar shows them. Each one
 * is a route under the workspace; the last path segment is `segment`.
 */
const SETTINGS_GROUPS = [
  {
    label: "Data",
    items: [
      {
        label: "Collections",
        icon: Database,
        segment: "data",
        to: "/dashboard/workspaces/$workspaceId/data",
      },
      {
        label: "Jobs",
        icon: CalendarClock,
        segment: "jobs",
        to: "/dashboard/workspaces/$workspaceId/jobs",
      },
      {
        label: "Files",
        icon: Files,
        segment: "artifacts",
        to: "/dashboard/workspaces/$workspaceId/artifacts",
      },
    ],
  },
  {
    label: "Access",
    items: [
      {
        label: "Connections",
        icon: Plug,
        segment: "connections",
        to: "/dashboard/workspaces/$workspaceId/connections",
      },
      {
        label: "Members",
        icon: Users,
        segment: "members",
        to: "/dashboard/workspaces/$workspaceId/members",
      },
    ],
  },
  {
    label: "Workspace",
    items: [
      {
        label: "Dashboards",
        icon: FileText,
        segment: "pages",
        to: "/dashboard/workspaces/$workspaceId/pages",
      },
      {
        label: "Activity",
        icon: History,
        segment: "activity",
        to: "/dashboard/workspaces/$workspaceId/activity",
      },
      {
        label: "Usage",
        icon: Gauge,
        segment: "usage",
        to: "/dashboard/workspaces/$workspaceId/usage",
      },
    ],
  },
] as const

const SETTINGS_SEGMENTS: ReadonlyArray<string> = SETTINGS_GROUPS.flatMap(
  (group) => group.items.map((item) => item.segment)
)

/** The settings segment of `pathname`, such as "members", or null. */
function settingsSegment(pathname: string): string | null {
  const segment = /^\/dashboard\/workspaces\/[^/]+\/([^/]+)\/?$/.exec(
    pathname
  )?.[1]
  return segment && SETTINGS_SEGMENTS.includes(segment) ? segment : null
}

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
  const segment = settingsSegment(pathname)
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
            {segment && workspaceId ? (
              <SidebarMenuButton asChild>
                <Link to="/dashboard/workspaces">
                  <ChevronLeft />
                  <span className="font-semibold">Settings</span>
                </Link>
              </SidebarMenuButton>
            ) : (
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
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {segment && workspaceId ? (
          <SettingsNav
            workspaceId={workspaceId}
            segment={segment}
            workspaces={workspaces.results}
          />
        ) : (
          <DashboardsNav
            loading={workspaces.status === "LoadingFirstPage"}
            workspaces={workspaces.results}
            currentWorkspaceId={workspaceId}
            currentPageId={pageId}
          />
        )}
      </SidebarContent>
      <SidebarFooter>
        {!segment && settingsWorkspace && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Settings">
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
  currentWorkspaceId,
  currentPageId,
}: {
  loading: boolean
  workspaces: ReadonlyArray<WorkspaceRow>
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
                  <Link
                    to="/dashboard/workspaces/$workspaceId/pages"
                    params={{ workspaceId: workspace._id }}
                    search={{ new: true }}
                  >
                    <Plus />
                    <span className="text-sidebar-muted">New dashboard</span>
                  </Link>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            )}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

/** One workspace's settings, with a switch to the same page of another. */
function SettingsNav({
  workspaceId,
  segment,
  workspaces,
}: {
  workspaceId: string
  segment: string
  workspaces: ReadonlyArray<WorkspaceRow>
}) {
  const navigate = useNavigate()
  const current = workspaces.find((workspace) => workspace._id === workspaceId)
  return (
    <>
      <SidebarGroup>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg">
                  <div className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate font-semibold">
                      {current?.name ?? "Workspace"}
                    </span>
                    {current && (
                      <span className="truncate text-xs text-sidebar-muted">
                        {ROLE_LABELS[current.role]}
                      </span>
                    )}
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
              >
                <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
                {workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace._id}
                    onSelect={() =>
                      void navigate({
                        to: `/dashboard/workspaces/${workspace._id}/${segment}`,
                      })
                    }
                  >
                    <span className="truncate">{workspace.name}</span>
                    {workspace._id === workspaceId && (
                      <Check className="ml-auto" />
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      {SETTINGS_GROUPS.map((group) => (
        <Collapsible
          key={group.label}
          defaultOpen
          className="group/settings"
          asChild
        >
          <SidebarGroup>
            <SidebarGroupLabel asChild>
              <CollapsibleTrigger asChild>
                <button type="button" className="w-full justify-between">
                  {group.label}
                  <ChevronRight className="transition-transform group-data-[state=open]/settings:rotate-90 motion-reduce:transition-none" />
                </button>
              </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.segment}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.label}
                      isActive={item.segment === segment}
                    >
                      <Link to={item.to} params={{ workspaceId }}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </CollapsibleContent>
          </SidebarGroup>
        </Collapsible>
      ))}
    </>
  )
}
