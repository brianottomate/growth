"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Calendar,
  Check,
  ChevronsUpDown,
  Database,
  FileText,
  Image as ImageIcon,
  Inbox,
  Layers,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Mail,
  Megaphone,
  Newspaper,
  Plus,
  Radar,
  Repeat,
  Rss,
  Settings,
  Share2,
  Snowflake,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { authClient } from "@/server/better-auth/client";
import { useTRPC } from "@/trpc/react";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
};

const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [{ label: "Overview", href: "/app", icon: LayoutDashboard }] },
  {
    label: "Workspace",
    items: [
      { label: "Brands", href: "/app/brands", icon: Building2 },
      { label: "Channels", href: "/app/channels", icon: Share2 },
      { label: "Content", href: "/app/content", icon: FileText },
      { label: "Calendar", href: "/app/calendar", icon: Calendar },
      { label: "Feed", href: "/app/feed", icon: Rss },
      { label: "Studio", href: "/app/studio", icon: Sparkles },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Pillars", href: "/app/pillars", icon: Layers },
      { label: "Blog", href: "/app/blog", icon: Newspaper },
      { label: "Newsletters", href: "/app/newsletters", icon: Mail },
      { label: "Campaigns", href: "/app/campaigns", icon: Megaphone },
      { label: "Audiences", href: "/app/audiences", icon: Target },
      { label: "Seasons", href: "/app/seasons", icon: Snowflake },
    ],
  },
  {
    label: "Grow",
    items: [
      { label: "Leads", href: "/app/leads", icon: Database },
      { label: "Listen", href: "/app/listen", icon: Radar, badge: "12" },
      { label: "Lifecycle", href: "/app/lifecycle", icon: Repeat },
      { label: "Inbox", href: "/app/inbox", icon: Inbox, badge: "3" },
    ],
  },
  {
    label: "Library",
    items: [
      { label: "Media", href: "/app/media", icon: ImageIcon },
      { label: "People", href: "/app/people", icon: Users },
    ],
  },
];

interface AppSidebarProps {
  orgName: string;
  orgSlug?: string;
  userName: string;
  userEmail: string;
}

export function AppSidebar({
  orgName,
  orgSlug,
  userName,
  userEmail,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const trpc = useTRPC();
  const { data: orgs } = useQuery(trpc.org.list.queryOptions());

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={orgName}>
                  <div className="bg-primary text-primary-foreground flex aspect-square size-7 items-center justify-center rounded-md text-sm font-semibold">
                    {orgName.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-semibold">
                      {orgName}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      Organization
                    </span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
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
        {NAV_GROUPS.map((group, i) => (
          <SidebarGroup key={group.label ?? `group-${i}`}>
            {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive(item.href)}
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
                  <div className="bg-muted text-foreground flex aspect-square size-7 items-center justify-center rounded-full text-xs font-semibold">
                    {userName.slice(0, 2).toUpperCase()}
                  </div>
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
