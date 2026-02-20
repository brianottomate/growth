import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Building2, Users, Sparkles } from "lucide-react";

import { getSession } from "@/server/better-auth/server";
import { CreateOrganizationForm } from "./CreateOrganizationForm";

export const metadata: Metadata = {
  title: "Create Organization",
  description: "Create a new organization to collaborate with your team.",
};

export default async function CreateOrganizationPage() {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Create Organization</h1>
          <p className="text-muted-foreground mt-2">
            Set up a workspace to manage projects and collaborate with your
            team.
          </p>
        </div>

        <CreateOrganizationForm />

        {/* Quick benefits callout */}
        <div className="bg-muted/50 flex gap-4 rounded-lg border p-4">
          <div className="flex flex-1 items-start gap-3">
            <div className="bg-background flex size-8 shrink-0 items-center justify-center rounded-md">
              <Sparkles className="text-primary size-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Shared workspace</p>
              <p className="text-muted-foreground text-xs">
                Collaborate on projects with your team members
              </p>
            </div>
          </div>
          <div className="flex flex-1 items-start gap-3">
            <div className="bg-background flex size-8 shrink-0 items-center justify-center rounded-md">
              <Users className="text-primary size-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Team management</p>
              <p className="text-muted-foreground text-xs">
                Invite members and manage permissions easily
              </p>
            </div>
          </div>
          <div className="flex flex-1 items-start gap-3">
            <div className="bg-background flex size-8 shrink-0 items-center justify-center rounded-md">
              <Building2 className="text-primary size-4" />
            </div>
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Organization settings</p>
              <p className="text-muted-foreground text-xs">
                Customize branding and team configuration
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
