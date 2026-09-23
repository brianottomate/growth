"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Crown,
  Settings,
  Shield,
  Users,
  Plus,
  Mail,
} from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { orpc } from "@/orpc/client";
import { OrganizationInviteDialog } from "./OrganizationInviteDialog";

interface OrganizationViewProps {
  orgSlug: string;
}

const roleIcons = {
  owner: Crown,
  admin: Shield,
  member: Users,
};

const roleColors = {
  owner: "destructive" as const,
  admin: "default" as const,
  member: "secondary" as const,
};

function getInitials(name: string | null | undefined): string {
  if (!name) return "U";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function OrganizationView({ orgSlug }: OrganizationViewProps) {
  const {
    data: orgData,
    isLoading,
    error,
  } = useQuery(orpc.org.getBySlug.queryOptions({ input: { slug: orgSlug } }));

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-6 text-center">
        <h2 className="text-lg font-semibold">Error Loading Organization</h2>
        <p className="mt-2 text-muted-foreground">
          {error.message || "Failed to load organization data."}
        </p>
      </div>
    );
  }

  if (!orgData) {
    return (
      <div className="text-center">
        <h2 className="text-lg font-semibold">Organization Not Found</h2>
        <p className="mt-2 text-muted-foreground">
          The organization you&apos;re looking for doesn&apos;t exist or you
          don&apos;t have access to it.
        </p>
      </div>
    );
  }

  const { organization, members, userRole } = orgData;
  const isAdmin = userRole === "owner" || userRole === "admin";

  return (
    <div className="space-y-6">
      {/* Organization Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <Avatar className="size-12">
            <AvatarImage
              src={organization.logo || undefined}
              alt={organization.name}
            />
            <AvatarFallback tone="primary">
              <Building2 className="size-6" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{organization.name}</h1>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="capitalize">
                {organization.plan}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Your role: {userRole}
              </span>
            </div>
          </div>
          {isAdmin && (
            <div className="flex gap-2">
              <Link href={`/app/org/${orgSlug}/settings`}>
                <Button variant="outline">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              </Link>
              <OrganizationInviteDialog organizationId={organization.id}>
                <Button>
                  <Plus className="size-4" />
                  Invite Members
                </Button>
              </OrganizationInviteDialog>
            </div>
          )}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4" />
              Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{members.length}</div>
            <p className="text-xs text-muted-foreground">Active team members</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Building2 className="size-4" />
              Organization Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold capitalize">
              {organization.plan}
            </div>
            <p className="text-xs text-muted-foreground">Current plan</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Mail className="size-4" />
              Slug
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="truncate text-2xl font-bold">
              {organization.slug}
            </div>
            <p className="text-xs text-muted-foreground">Organization ID</p>
          </CardContent>
        </Card>
      </div>

      {/* Members Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-5" />
                Members ({members.length})
              </CardTitle>
              <CardDescription>
                People who have access to this organization
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {members.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">
              No members found
            </p>
          ) : (
            <div className="space-y-3">
              {members.map((member) => {
                const RoleIcon = roleIcons[member.role];
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarImage src={member.user.image ?? undefined} />
                        <AvatarFallback>
                          {getInitials(member.user.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {member.user.name || "Unknown User"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {member.user.email}
                        </div>
                      </div>
                    </div>
                    <Badge variant={roleColors[member.role]}>
                      <RoleIcon className="size-3" />
                      {member.role}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Getting Started Card */}
      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Next steps to make the most of your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {isAdmin && members.length === 1 && (
              <div className="flex items-start gap-3 rounded-lg border p-3">
                <Users className="mt-0.5 size-5 text-primary" />
                <div className="flex-1">
                  <h4 className="font-medium">Invite team members</h4>
                  <p className="text-sm text-muted-foreground">
                    Collaborate with your team by inviting members to your
                    organization.
                  </p>
                </div>
                <OrganizationInviteDialog organizationId={organization.id}>
                  <Button size="sm">Invite</Button>
                </OrganizationInviteDialog>
              </div>
            )}
            <div className="flex items-start gap-3 rounded-lg border p-3">
              <Settings className="mt-0.5 size-5 text-primary" />
              <div className="flex-1">
                <h4 className="font-medium">Customize settings</h4>
                <p className="text-sm text-muted-foreground">
                  Update your organization name, logo, and other preferences.
                </p>
              </div>
              {isAdmin && (
                <Link href={`/app/org/${orgSlug}/settings`}>
                  <Button size="sm" variant="outline">
                    Settings
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
