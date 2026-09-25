import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { getSession } from "@/server/better-auth/server";
import { HydrateClient, prefetch, orpc, serverApi } from "@/orpc/server";
import { GeneralInfoForm } from "./GeneralInfoForm";
import { DeleteOrganizationButton } from "./DeleteOrganizationButton";
import { OrganizationLogoUpload } from "./OrganizationLogoUpload";

export const metadata: Metadata = {
  title: "Organization Settings",
  description: "Manage your organization settings and details.",
};

export default async function OrganizationSettingsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  const { orgSlug } = await params;

  prefetch(orpc.org.getBySlug.queryOptions({ input: { slug: orgSlug } }));

  // Fetch organization data to pass to OrganizationLogoUpload
  const caller = serverApi;
  const orgData = await caller.org.getBySlug({ slug: orgSlug });

  return (
    <HydrateClient>
      <div className="mx-auto max-w-2xl space-y-8 @xl:space-y-10">
        <div>
          <h1 className="text-2xl font-bold @xl:text-3xl">
            Organization Settings
          </h1>
          <p className="mt-2 text-sm text-muted-foreground @xl:text-base">
            Manage your organization information and settings.
          </p>
        </div>

        <div className="space-y-6">
          {/* Organization Logo */}
          <Card>
            <CardHeader>
              <CardTitle>Organization Logo</CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload a logo for your organization.
              </p>
            </CardHeader>
            <CardContent>
              <OrganizationLogoUpload
                organizationId={orgData.organization.id}
                currentLogo={orgData.organization.logo}
                orgSlug={orgSlug}
                organizationName={orgData.organization.name}
              />
            </CardContent>
          </Card>

          {/* General Information */}
          <Card>
            <CardHeader>
              <CardTitle>General Information</CardTitle>
              <p className="text-sm text-muted-foreground">
                Update your organization&apos;s basic information.
              </p>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div>Loading...</div>}>
                <GeneralInfoForm orgSlug={orgSlug} />
              </Suspense>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card tone="error">
            <CardHeader>
              <CardTitle tone="error">Danger Zone</CardTitle>
              <p className="text-sm text-muted-foreground">
                Dangerous actions for your organization.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col space-y-4">
                <p className="text-sm">
                  Once you delete an organization, there is no going back.
                  Please be certain.
                </p>
                <DeleteOrganizationButton orgSlug={orgSlug} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </HydrateClient>
  );
}
