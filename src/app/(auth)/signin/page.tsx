import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";

import { env } from "@/env";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your account to continue.",
};

// Only offer Google SSO when its OAuth credentials are configured (matches the
// conditional provider registration in better-auth/config.ts).
const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export default function SignInPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6 md:max-w-3xl">
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">Wander Growth</span>
          </Link>
        </div>
        <Suspense fallback={<div className="min-h-[400px]" />}>
          <SignInForm googleEnabled={googleEnabled} />
        </Suspense>
      </div>
    </div>
  );
}
