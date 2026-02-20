"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SuccessAlert, WarningAlert } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import { authClient } from "@/server/better-auth/client";
import {
  getCallbackURL,
  getEmailInboxUrl,
  getEmailProviderName,
} from "@/lib/auth-utils";
import { InAppBrowserAlert } from "../components/InAppBrowserAlert";
import { useInAppBrowser } from "@/hooks/useInAppBrowser";
import { ForgotPasswordDialog } from "./ForgotPasswordDialog";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isInAppBrowser } = useInAppBrowser();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [emailVerificationSent, setEmailVerificationSent] = useState(false);
  const [isForgotPasswordOpen, setIsForgotPasswordOpen] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const passwordResetComplete =
    searchParams.get("message") === "password_reset_success";
  const emailVerified = searchParams.get("message") === "email_verified";

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEmailLoading(true);
    setError(null);
    setNeedsEmailVerification(false);

    // Determine callback URL based on invite context
    const callbackURL = getCallbackURL(searchParams);

    try {
      const { data, error } = await authClient.signIn.email({
        email,
        password,
        rememberMe: true,
        callbackURL,
      });

      if (error) {
        // Better error handling based on error status
        if (error.status === 403) {
          // Email verification required
          setNeedsEmailVerification(true);
        } else {
          setError(error.message ?? "Failed to sign in");
        }
      } else if (data) {
        // Clear any previous verification states and redirect
        setNeedsEmailVerification(false);
        setEmailVerificationSent(false);
        router.push(callbackURL);
        router.refresh();
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

  const handleSendVerificationEmail = async (emailToSend: string) => {
    if (resendCooldown > 0) return;

    const callbackURL = getCallbackURL(searchParams, {
      includeEmail: emailToSend,
    });

    try {
      await authClient.sendVerificationEmail({
        email: emailToSend,
        callbackURL,
      });
      setEmailVerificationSent(true);
      toast.success("Verification email sent!");
      setResendCooldown(10);
    } catch (err) {
      console.error("Verification email failed", err);
      toast.error("Failed to send verification email. Please try again.");
    }
  };

  return (
    <>
      <div className="flex flex-col gap-6">
        <Card className="overflow-hidden p-0">
          <CardContent className="grid p-0 md:grid-cols-2">
            <div className="p-6 md:p-8">
              <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center text-center">
                  <h1 className="text-2xl font-bold">
                    {searchParams.get("inviteId") ||
                    searchParams.get("orgInviteId")
                      ? "Sign in to accept invite"
                      : "Welcome back"}
                  </h1>
                  <p className="text-muted-foreground text-balance">
                    {searchParams.get("inviteId") ||
                    searchParams.get("orgInviteId")
                      ? "Sign in to your account to accept the invitation"
                      : "Sign in to your account"}
                  </p>
                </div>

                <InAppBrowserAlert />

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {passwordResetComplete && (
                  <SuccessAlert>
                    Password reset successfully! You can now sign in with your
                    new password.
                  </SuccessAlert>
                )}

                {emailVerified && (
                  <SuccessAlert>
                    Email verified successfully! You can now sign in to your
                    account.
                  </SuccessAlert>
                )}

                {needsEmailVerification && (
                  <WarningAlert>
                    <p>Please verify your email address before signing in.</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                      <a
                        href={getEmailInboxUrl(email)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-md bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-800 hover:bg-yellow-200"
                      >
                        Open {getEmailProviderName(email)}
                      </a>
                      <span className="text-yellow-700">or</span>
                      <button
                        type="button"
                        onClick={() => handleSendVerificationEmail(email)}
                        disabled={resendCooldown > 0}
                        className="cursor-pointer text-xs underline hover:no-underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-50"
                      >
                        {resendCooldown > 0
                          ? `resend in ${resendCooldown}s`
                          : "resend email"}
                      </button>
                    </div>
                  </WarningAlert>
                )}

                {emailVerificationSent && (
                  <SuccessAlert>
                    <p>
                      Verification email sent to{" "}
                      <strong className="font-semibold">{email}</strong>
                    </p>
                    <div className="mt-2">
                      <a
                        href={getEmailInboxUrl(email)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-200"
                      >
                        Open {getEmailProviderName(email)}
                      </a>
                    </div>
                  </SuccessAlert>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleLoading || isInAppBrowser}
                  title={
                    isInAppBrowser
                      ? "Google sign-in is not available in in-app browsers"
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
                      Signing in...
                    </>
                  ) : (
                    "Sign in with Google"
                  )}
                </Button>

                <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
                  <span className="bg-card text-muted-foreground relative z-10 px-2">
                    Or continue with email
                  </span>
                </div>

                <form onSubmit={handleSignIn} className="space-y-4">
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
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={() => setIsForgotPasswordOpen(true)}
                        className="cursor-pointer text-sm underline-offset-2 hover:underline"
                      >
                        Forgot your password?
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      disabled={isEmailLoading}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isEmailLoading}
                  >
                    {isEmailLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </form>

                <div className="text-center text-sm">
                  Don&apos;t have an account?{" "}
                  <Link
                    href={
                      searchParams.get("inviteId")
                        ? `/signup?inviteId=${searchParams.get("inviteId")}`
                        : searchParams.get("orgInviteId")
                          ? `/signup?orgInviteId=${searchParams.get("orgInviteId")}`
                          : "/signup"
                    }
                    className="underline underline-offset-4"
                  >
                    Sign up
                  </Link>
                </div>
              </div>
            </div>
            <div className="bg-muted relative hidden md:block">
              <Image
                src="/placeholder.svg"
                alt="Sign in illustration"
                fill
                className="absolute inset-0 h-full w-full object-cover object-left dark:brightness-[0.2] dark:grayscale"
              />
            </div>
          </CardContent>
        </Card>
        <div className="text-muted-foreground text-center text-xs text-balance">
          By clicking continue, you agree to our{" "}
          <Link
            href="/terms"
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

      <ForgotPasswordDialog
        open={isForgotPasswordOpen}
        onOpenChange={setIsForgotPasswordOpen}
        defaultEmail={email}
      />
    </>
  );
}
