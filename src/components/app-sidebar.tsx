"use client";

import Link from "next/link";
import { Logo } from "@wandercom/design-system-web/ui/logo";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useTheme } from "@/components/ui/theme";
import { authClient } from "@/server/better-auth/client";
import { useTRPC } from "@/trpc/react";
import { NAV_GROUPS, type NavItem } from "@/components/app-nav";


interface AppSidebarProps {
  orgName: string;
  orgSlug?: string;
  userName: string;
  userEmail: string;
  userImage?: string;
}

export function AppSidebar({
  orgName,
  orgSlug,
  userName,
  userEmail,
  userImage,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const trpc = useTRPC();
  const { data: orgs } = useQuery(trpc.org.list.queryOptions());
  const { themeMode, setTheme } = useTheme();

  const isActive = (item: NavItem) =>
    item.href === "/app" || item.exact
      ? pathname === item.href
      : pathname.startsWith(item.href);

  const handleSignOut = async () => {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Org switcher disabled: kept open={false} + non-trigger button so
                the selector is not accessible from the frontend, but the code
                remains intact for when multi-org support is re-enabled. */}
            <DropdownMenu open={false}>
              <SidebarMenuButton
                size="lg"
                tooltip={orgName}
                className="cursor-default"
              >
                {/* The real logomark, not the first letter of the org name.
                    Same component the client-facing connect page uses, so the
                    back-office and the pages we send clients agree. */}
                <div className="bg-primary text-primary-foreground flex aspect-square size-7 items-center justify-center rounded-md">
                  <Logo variant="logomark" className="size-4" />
                </div>
                <div className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-sm font-semibold">
                    {orgName}
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    Organization
                  </span>
                </div>
              </SidebarMenuButton>
              <DropdownMenuContent align="start" side="right" className="w-56">
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Organizations
                </DropdownMenuLabel>
                {orgs?.map((o) => (
                  <DropdownMenuItem key={o.id} asChild>
                    <Link href={`/app/org/${o.slug}`}>
                      <Building2 className="size-4" />
                      <span className="flex-1 truncate">{o.name}</span>
                      {o.name === orgName && <Check className="size-4" />}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                {orgSlug && (
                  <DropdownMenuItem asChild>
                    <Link href={`/app/org/${orgSlug}/settings`}>
                      <Settings className="size-4" />
                      Organization settings
                    </Link>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <Link href="/app/org/create">
                    <Plus className="size-4" />
                    Create organization
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  tooltip="Search content (⌘K)"
                  onClick={() =>
                    window.dispatchEvent(new Event("growth-command-menu:open"))
                  }
                >
                  <Search />
                  <span>Search</span>
                  <kbd className="text-muted-foreground bg-muted ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium group-data-[collapsible=icon]:hidden">
                    ⌘K
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {NAV_GROUPS.map((group, i) => (
          <SidebarGroup key={group.label ?? `group-${i}`}>
            {group.label && (
              <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item)}
                      tooltip={item.label}
                    >
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badge && (
                      <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={userEmail}>
                  <Avatar className="size-7">
                    <AvatarImage src={userImage} alt={userName} />
                    <AvatarFallback className="text-foreground text-xs font-semibold">
                      {userName.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">
                      {userName}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {userEmail}
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="right" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <span className="truncate text-sm font-medium">
                      {userName}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {userEmail}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/app/account">
                    <Settings className="size-4" />
                    Account settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground text-xs">
                  Theme
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={themeMode}
                  onValueChange={(value) => setTheme(value as typeof themeMode)}
                >
                  <DropdownMenuRadioItem value="light" suppressHydrationWarning>
                    <Sun className="size-4" />
                    Light
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark" suppressHydrationWarning>
                    <Moon className="size-4" />
                    Dark
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="auto" suppressHydrationWarning>
                    <Monitor className="size-4" />
                    System
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
