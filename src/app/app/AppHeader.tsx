"use client";

import Link from "next/link";
import { BarChart3, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme";

import { UserDropdown } from "./UserDropdown";
import { OrganizationDialog } from "./OrganizationDialog";
import type { Session } from "@/server/better-auth/config";

interface AppHeaderProps {
  session: Session;
}

export function AppHeader({ session }: AppHeaderProps) {
  return (
    <nav className="bg-background border-b">
      <div className="mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8">
        {/* Left side - Logo and Navigation */}
        <div className="flex items-center space-x-6">
          <Link href="/app/dashboard" className="flex items-center space-x-2">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <BarChart3 className="size-4" />
            </div>
            <span className="text-xl font-bold">Wander Growth</span>
          </Link>
          <div className="hidden items-center space-x-1 md:flex">
            <Link href="/app/dashboard">
              <Button variant="ghost" size="sm">
                Dashboard
              </Button>
            </Link>
          </div>
        </div>

        {/* Right side - Organizations + Theme Toggle + User Dropdown */}
        <div className="flex items-center space-x-2">
          {/* Organization Dialog - Full button on desktop, icon only on mobile */}
          <div className="hidden md:block">
            <OrganizationDialog />
          </div>
          <div className="block md:hidden">
            <OrganizationDialog
              trigger={
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <Building2 className="h-4 w-4" />
                  <span className="sr-only">Organizations</span>
                </Button>
              }
            />
          </div>
          <ThemeToggle />
          <UserDropdown user={session.user} />
        </div>
      </div>
    </nav>
  );
}
