import type { Metadata } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";

import { env } from "@/env";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your account and start organizing today.",
};

// Only offer Google SSO when its OAuth credentials are configured (matches the
// conditional provider registration in better-auth/config.ts).
const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export default function SignUpPage() {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">Wander Growth</span>
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <Suspense fallback={<div className="min-h-[500px]" />}>
              <SignUpForm googleEnabled={googleEnabled} />
            </Suspense>
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <Image
          src="/auth-hero.jpg"
          alt="A Wander home at golden hour"
          sizes="(min-width: 1024px) 50vw, 0px"
          className="absolute inset-0 h-full w-full object-cover"
          fill
        />
      </div>
    </div>
  );
}
