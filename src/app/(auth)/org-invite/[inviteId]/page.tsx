import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { Building2 } from "lucide-react";

import { trpcApi } from "@/trpc/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OrganizationInviteClient } from "./OrganizationInviteClient";
import { authClient } from "@/server/better-auth/client";

interface InvitePageProps {
  params: Promise<{ inviteId: string }>;
}

export async function generateMetadata({
  params,
}: InvitePageProps): Promise<Metadata> {
  const { inviteId } = await params;

  try {
    const caller = await trpcApi();
    const invitation = await caller.org.getOrgInvite({
      invitationId: inviteId,
    });

    return {
      title: `Join ${invitation.organization.name}`,
      description: `You've been invited to join ${invitation.organization.name}.`,
    };
  } catch {
    return {
      title: "Organization Invitation",
      description: "Join an organization by accepting your invitation.",
    };
  }
}

export default async function InvitePage({ params }: InvitePageProps) {
  const { inviteId } = await params;

  let invitation = null;
  let errorMessage: string | null = null;

  const caller = await trpcApi();

  try {
    invitation = await caller.org.getOrgInvite({ invitationId: inviteId });
  } catch (error) {
    errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";
  }

  const sessionResult = await authClient.getSession();
  const session = sessionResult.data;

  // Handle errors server-side
  if (errorMessage || !invitation) {
    let errorTitle = "Invalid Invitation";
    let errorDescription =
      "This invitation link is invalid, expired, or has already been used.";

    if (errorMessage) {
      if (errorMessage.includes("expired")) {
        errorTitle = "Invitation Expired";
        errorDescription =
          "This invitation has expired and can no longer be used.";
      } else if (errorMessage.includes("no longer valid")) {
        errorTitle = "Invitation Already Used";
        errorDescription =
          "This invitation has already been accepted or rejected.";
      } else if (errorMessage.includes("not found")) {
        errorTitle = "Invitation Not Found";
        errorDescription =
          "This invitation link does not exist or has been removed.";
      }
    }

    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-red-600">{errorTitle}</CardTitle>
              <CardDescription>{errorDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              {session?.user ? (
                <Button asChild className="w-full">
                  <Link href="/app">Go to Dashboard</Link>
                </Button>
              ) : (
                <div className="flex flex-col gap-2">
                  <Button asChild className="w-full">
                    <Link href="/signin">Sign In</Link>
                  </Button>
                  <Button asChild variant="outline" className="w-full">
                    <Link href="/signup">Sign Up</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Left column - Invite form */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md">
              <Building2 className="size-4" />
            </div>
            <span className="text-xl font-bold">Your App</span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <Suspense fallback={<div className="min-h-[500px]" />}>
              <OrganizationInviteClient
                inviteId={inviteId}
                initialInvitation={invitation}
                initialSession={session}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* Right column - Branding image */}
      <div className="bg-muted relative hidden lg:block">
        <Image
          src="/placeholder.svg"
          alt="Organizations"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
          fill
        />
      </div>
    </div>
  );
}
