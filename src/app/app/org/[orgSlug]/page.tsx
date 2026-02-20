import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getSession } from "@/server/better-auth/server";
import { OrganizationView } from "./OrganizationView";

interface OrganizationPageProps {
  params: Promise<{ orgSlug: string }>;
}

export const metadata: Metadata = {
  title: "Organization",
  description: "View and manage your organization members and teams.",
};

export default async function OrganizationPage({
  params,
}: OrganizationPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  const { orgSlug } = await params;

  if (!orgSlug) {
    notFound();
  }

  return <OrganizationView orgSlug={orgSlug} />;
}
