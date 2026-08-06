"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorAlert } from "@/components/ui/alert";
import { authClient } from "@/server/better-auth/client";
import { getAuthPageHref, getCallbackURL } from "@/lib/auth-utils";
import { InAppBrowserAlert } from "../components/InAppBrowserAlert";
import { GoogleSignInButton } from "../components/GoogleSignInButton";

export function SignUpForm({
  googleEnabled = false,
}: {
  googleEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOAuthRequest =
    searchParams.has("client_id") && searchParams.has("redirect_uri");
  const signInHref = isOAuthRequest
    ? `/signin?${searchParams.toString()}`
    : getAuthPageHref("/signin", searchParams);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEmailLoading(true);
    setError(null);

    // Determine callback URL based on invite context
    const callbackURL = getCallbackURL(searchParams, {
      includeEmail: email,
      isNewSignup: true,
    });

    try {
      const { data, error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
        callbackURL,
      });

      if (signUpError) {
        setError(signUpError.message ?? "Failed to create account");
      } else if (data) {
        // Email verification is disabled, so the user is signed in immediately.
        router.push(callbackURL);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsEmailLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">
          {searchParams.get("inviteId") || searchParams.get("orgInviteId")
            ? "Create account to accept invite"
            : "Create your account"}
        </h1>
        <p className="text-muted-foreground text-sm text-balance">
          {searchParams.get("inviteId")
            ? "Create an account to accept the collection invitation"
            : searchParams.get("orgInviteId")
              ? "Create an account to join the organization"
              : "Sign up to get started"}
        </p>
      </div>

      <InAppBrowserAlert />

      {error && <ErrorAlert>{error}</ErrorAlert>}

      <div className="grid gap-6">
        {googleEnabled && (
          <>
            <GoogleSignInButton
              isNewSignup
              email={email}
              disabled={isEmailLoading}
            />
            <div className="flex items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-xs">
                or sign up with email
              </span>
              <span className="bg-border h-px flex-1" />
            </div>
          </>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              required
              disabled={isEmailLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="me@example.com"
              required
              disabled={isEmailLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              disabled={isEmailLoading}
            />
            <p className="text-muted-foreground text-xs">
              At least 8 characters
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={isEmailLoading}>
            {isEmailLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              "Create account"
            )}
          </Button>
        </form>
      </div>

      <div className="text-center text-sm">
        Already have an account?{" "}
        <Link href={signInHref} className="underline underline-offset-4">
          Sign in
        </Link>
      </div>
    </div>
  );
}
