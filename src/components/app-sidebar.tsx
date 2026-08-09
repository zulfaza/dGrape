import * as React from "react";
import { Building2, LayoutDashboard, UserRound } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { HugeiconsIcon } from "@hugeicons/react";
import { TerminalIcon } from "@hugeicons/core-free-icons";
import type { User } from "@workos/authkit-tanstack-react-start";

import { NavUser } from "@/components/nav-user";
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
} from "@/components/ui/sidebar";

const ACTIVE_LINK_PROPS = { "data-active": true };

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user: User;
}) {
  const name = user.name || [user.firstName, user.lastName].filter(Boolean).join(" ");
  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <div>
                <div className="flex aspect-square size-8 items-center justify-center bg-primary text-primary-foreground">
                  <HugeiconsIcon icon={TerminalIcon} strokeWidth={2} className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold tracking-tight">dGrape</span>
                </div>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Role inbox">
                <Link activeProps={ACTIVE_LINK_PROPS} to="/dashboard/applications">
                  <LayoutDashboard />
                  <span>Role inbox</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Companies">
                <Link activeProps={ACTIVE_LINK_PROPS} to="/dashboard/companies">
                  <Building2 />
                  <span>Companies</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Memory">
                <Link activeProps={ACTIVE_LINK_PROPS} to="/dashboard/profile">
                  <UserRound />
                  <span>Memory</span>
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
  );
}
