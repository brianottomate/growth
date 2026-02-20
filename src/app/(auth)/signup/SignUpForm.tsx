"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorAlert, SuccessAlert } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/server/better-auth/client";
import {
  getCallbackURL,
  getEmailInboxUrl,
  getEmailProviderName,
} from "@/lib/auth-utils";
import { InAppBrowserAlert } from "../components/InAppBrowserAlert";
import { useInAppBrowser } from "@/hooks/useInAppBrowser";

export function SignUpForm() {
  const searchParams = useSearchParams();
  const { isInAppBrowser } = useInAppBrowser();

  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("email") || "");
  const [password, setPassword] = useState("");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEmailLoading(true);
    setError(null);
    setEmailVerificationSent(false);

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
        // Better Auth sends 403 for email verification required
        if (signUpError.status === 403) {
          setEmailVerificationSent(true);
        } else {
          setError(signUpError.message ?? "Failed to create account");
        }
      } else if (data) {
        // Account created successfully, email verification required
        setEmailVerificationSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsEmailLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);

    // Determine callback URL based on invite context
    const callbackURL = getCallbackURL(searchParams, {
      includeEmailParam: true,
      isNewSignup: true,
    });

    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
    } catch (err) {
      setError("Google sign-in failed. Please try again.");
      setIsGoogleLoading(false);
      console.error("Google sign-in failed", err);
    }
  };

  // Cooldown timer effect
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;

    const callbackURL = getCallbackURL(searchParams, {
      includeEmail: email,
      isNewSignup: true,
    });

    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL,
      });
      toast.success("Verification email sent!");
      setResendCooldown(10);
    } catch (err) {
      console.error("Error sending verification email", err);
      toast.error("Failed to send verification email. Please try again.");
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

      {emailVerificationSent && (
        <SuccessAlert>
          <p>
            Verification email sent to{" "}
            <strong className="font-semibold">{email}</strong>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <a
              href={getEmailInboxUrl(email)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-200"
            >
              Open {getEmailProviderName(email)}
            </a>
            <span className="text-green-700">or</span>
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resendCooldown > 0}
              className="cursor-pointer text-xs underline hover:no-underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
            >
              {resendCooldown > 0
                ? `resend in ${resendCooldown}s`
                : "resend email"}
            </button>
          </div>
        </SuccessAlert>
      )}

      <div className="grid gap-6">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogleSignIn}
          disabled={isGoogleLoading || isInAppBrowser}
          title={
            isInAppBrowser
              ? "Google sign-up is not available in in-app browsers"
              : undefined
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className="mr-2 h-4 w-4"
          >
            <path
              d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
              fill="currentColor"
            />
          </svg>
          {isGoogleLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Signing up...
            </>
          ) : (
            "Sign up with Google"
          )}
        </Button>

        <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
          <span className="bg-background text-muted-foreground relative z-10 px-2">
            Or continue with email
          </span>
        </div>

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
        <Link
          href={
            searchParams.get("inviteId")
              ? `/signin?inviteId=${searchParams.get("inviteId")}`
              : searchParams.get("orgInviteId")
                ? `/signin?orgInviteId=${searchParams.get("orgInviteId")}`
                : "/signin"
          }
          className="underline underline-offset-4"
        >
          Sign in
        </Link>
      </div>

      <div className="text-muted-foreground text-center text-xs text-balance">
        By clicking continue, you agree to our{" "}
        <Link
          href="/tos"
          className="hover:text-primary underline underline-offset-4"
        >
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link
          href="/privacy"
          className="hover:text-primary underline underline-offset-4"
        >
          Privacy Policy
        </Link>
        .
      </div>
    </div>
  );
}
