"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authClient } from "@/server/better-auth/client";
import { getAuthPageHref, getCallbackURL } from "@/lib/auth-utils";
import { InAppBrowserAlert } from "../components/InAppBrowserAlert";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isEmailLoading, setIsEmailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOAuthRequest =
    searchParams.has("client_id") && searchParams.has("redirect_uri");
  const signUpHref = isOAuthRequest
    ? `/signup?${searchParams.toString()}`
    : getAuthPageHref("/signup", searchParams);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsEmailLoading(true);
    setError(null);

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
        setError(error.message ?? "Failed to sign in");
      } else if (data) {
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
                  href={signUpHref}
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
    </div>
  );
}
