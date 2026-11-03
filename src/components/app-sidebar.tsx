import * as React from "react"
import {
  CalendarClock,
  Database,
  FileText,
  Files,
  Gauge,
  History,
  PanelsTopLeft,
  Plug,
} from "lucide-react"
import { Link, useParams } from "@tanstack/react-router"
import type { User } from "@workos/authkit-tanstack-react-start"

import { NavUser } from "@/components/nav-user"
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
  SidebarRail,
} from "@/components/ui/sidebar"

const ACTIVE_LINK_PROPS = { "data-active": true }

/** Workspace sections, in sidebar order. Each one has its own route. */
const WORKSPACE_SECTIONS = [
  {
    label: "Pages",
    icon: FileText,
    to: "/dashboard/workspaces/$workspaceId/pages",
  },
  {
    label: "Data",
    icon: Database,
    to: "/dashboard/workspaces/$workspaceId/data",
  },
  {
    label: "Jobs",
    icon: CalendarClock,
    to: "/dashboard/workspaces/$workspaceId/jobs",
  },
  {
    label: "Connections",
    icon: Plug,
    to: "/dashboard/workspaces/$workspaceId/connections",
  },
  {
    label: "Artifacts",
    icon: Files,
    to: "/dashboard/workspaces/$workspaceId/artifacts",
  },
  {
    label: "Activity",
    icon: History,
    to: "/dashboard/workspaces/$workspaceId/activity",
  },
  {
    label: "Usage",
    icon: Gauge,
    to: "/dashboard/workspaces/$workspaceId/usage",
  },
] as const

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: User
}) {
  const name =
    user.name || [user.firstName, user.lastName].filter(Boolean).join(" ")
  const { workspaceId } = useParams({ strict: false })
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
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Workspaces">
                <Link
                  activeProps={ACTIVE_LINK_PROPS}
                  to="/dashboard/workspaces"
                >
                  <PanelsTopLeft />
                  <span>Workspaces</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        {workspaceId && (
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
            <SidebarMenu>
              {WORKSPACE_SECTIONS.map((section) => (
                <SidebarMenuItem key={section.to}>
                  <SidebarMenuButton asChild tooltip={section.label}>
                    <Link
                      activeProps={ACTIVE_LINK_PROPS}
                      to={section.to}
                      params={{ workspaceId }}
                    >
                      <section.icon />
                      <span>{section.label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
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
