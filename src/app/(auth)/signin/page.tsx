import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";

import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your account to continue.",
};

export default function SignInPage() {
  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6 md:max-w-3xl">
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">Native</span>
          </Link>
        </div>
        <Suspense fallback={<div className="min-h-[400px]" />}>
          <SignInForm />
        </Suspense>
      </div>
    </div>
  );
}
