import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { getSession } from "@/server/better-auth/server";
import { trpc, HydrateClient, prefetch } from "@/trpc/server";
import { ProfileForm } from "./ProfileForm";
import { EmailVerificationForm } from "./EmailVerificationForm";
import { DeleteAccountButton } from "./DeleteAccountButton";
import { UserProfileImageUpload } from "./UserProfileImageUpload";

export const metadata = {
  title: "Account Settings",
  description: "Manage your account settings and preferences.",
};

export default async function AccountPage() {
  const session = await getSession();

  if (!session) {
    redirect("/signin");
  }

  // Prefetch user data
  prefetch(trpc.user.me.queryOptions());

  return (
    <HydrateClient>
      <div className="mx-auto max-w-2xl space-y-8 sm:space-y-10">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Account Settings</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Manage your profile data and account security.
          </p>
        </div>

        {/* Profile Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Profile</h2>
            <p className="text-muted-foreground text-sm">
              Your personal information
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Profile Image</CardTitle>
              <p className="text-muted-foreground text-sm">
                Upload a profile picture to personalize your account.
              </p>
            </CardHeader>
            <CardContent>
              <Suspense fallback={<div>Loading...</div>}>
                <UserProfileImageUpload />
              </Suspense>
            </CardContent>
          </Card>
        </div>

        {/* Account & Security Section */}
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Account & Security</h2>
            <p className="text-muted-foreground text-sm">
              Manage your login credentials and account access
            </p>
          </div>

          <div className="space-y-6">
            {/* Profile Information */}
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Basic account information for login and identification.
                </p>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div>Loading...</div>}>
                  <ProfileForm />
                </Suspense>
              </CardContent>
            </Card>

            {/* Email Verification */}
            <Card>
              <CardHeader>
                <CardTitle>Email Verification</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Verify your email to enable password reset and important
                  account notifications.
                </p>
              </CardHeader>
              <CardContent>
                <Suspense fallback={<div>Loading...</div>}>
                  <EmailVerificationForm />
                </Suspense>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <p className="text-muted-foreground text-sm">
                  Irreversible and destructive actions for your account.
                </p>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col space-y-4">
                  <p className="text-sm">
                    Once you delete your account, there is no going back. All
                    your data will be permanently removed.
                  </p>
                  <DeleteAccountButton userId={session.user.id} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </HydrateClient>
  );
}
