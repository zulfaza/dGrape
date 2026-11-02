import * as React from "react"
import { PanelsTopLeft } from "lucide-react"
import { Link } from "@tanstack/react-router"
import type { User } from "@workos/authkit-tanstack-react-start"

import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

const ACTIVE_LINK_PROPS = { "data-active": true }

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: User
}) {
  const name =
    user.name || [user.firstName, user.lastName].filter(Boolean).join(" ")
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
