import { Link, useNavigate } from "@tanstack/react-router"
import { usePaginatedQuery } from "convex/react"
import {
  CalendarClock,
  Check,
  ChevronsUpDown,
  Database,
  FileText,
  Files,
  Gauge,
  History,
  Plug,
  Users,
} from "lucide-react"
import type { ReactNode } from "react"
import { api } from "../../convex/_generated/api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ROLE_LABELS } from "@/components/workspace-role"
import { cn } from "@/lib/utils"

/**
 * Workspace settings, grouped as the settings nav shows them. Each one
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
export function settingsSegment(pathname: string): string | null {
  const segment = /^\/dashboard\/workspaces\/[^/]+\/([^/]+)\/?$/.exec(
    pathname
  )?.[1]
  return segment && SETTINGS_SEGMENTS.includes(segment) ? segment : null
}

/**
 * Settings of one workspace, as Sentry lays them out: a nav of grouped pages
 * beside the page, inside the content area. The app sidebar does not change.
 */
export function SettingsLayout({
  workspaceId,
  workspaceName,
  role,
  segment,
  children,
}: {
  workspaceId: string
  workspaceName: string | undefined
  role: keyof typeof ROLE_LABELS | undefined
  segment: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <SettingsNav
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        role={role}
        segment={segment}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-8">{children}</div>
    </div>
  )
}

function SettingsNav({
  workspaceId,
  workspaceName,
  role,
  segment,
}: {
  workspaceId: string
  workspaceName: string | undefined
  role: keyof typeof ROLE_LABELS | undefined
  segment: string
}) {
  const navigate = useNavigate()
  const workspaces = usePaginatedQuery(
    api.workspaces.list,
    {},
    { initialNumItems: 20 }
  )
  return (
    <nav
      aria-label="Settings"
      className="flex shrink-0 flex-col gap-5 md:sticky md:top-8 md:w-52 md:self-start"
    >
      <div className="flex flex-col gap-2">
        <h2 className="px-2 text-sm font-semibold">Settings</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="h-auto w-full justify-between">
              <span className="grid min-w-0 text-left leading-tight">
                <span className="truncate">{workspaceName ?? "Workspace"}</span>
                {role && (
                  <span className="truncate text-xs font-normal text-muted-foreground">
                    {ROLE_LABELS[role]}
                  </span>
                )}
              </span>
              <ChevronsUpDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
          >
            <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
            {workspaces.results.map((workspace) => (
              <DropdownMenuItem
                key={workspace._id}
                onSelect={() =>
                  void navigate({
                    to: `/dashboard/workspaces/${workspace._id}/${segment}`,
                  })
                }
              >
                <span className="truncate">{workspace.name}</span>
                {workspace._id === workspaceId && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            {workspaces.status === "CanLoadMore" && (
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault()
                  workspaces.loadMore(20)
                }}
              >
                More workspaces
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {SETTINGS_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          <p className="px-2 text-xs font-medium text-muted-foreground">
            {group.label}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = item.segment === segment
              return (
                <li key={item.segment}>
                  <Link
                    to={item.to}
                    params={{ workspaceId }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                      active && "bg-muted font-medium"
                    )}
                  >
                    <item.icon aria-hidden className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
