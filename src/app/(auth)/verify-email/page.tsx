"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { authClient } from "@/server/better-auth/client";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"verifying" | "success" | "error">(
    "verifying",
  );
  const [message, setMessage] = useState("");
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage(
        "No verification token found. Please check your email for the correct link.",
      );
      return;
    }

    // Verify email using Better Auth
    const verifyEmail = async () => {
      try {
        const { data, error } = await authClient.verifyEmail({
          query: { token },
        });

        if (error) {
          setStatus("error");
          setMessage(
            error.message ||
              "Unable to verify your email. The link may be expired or invalid.",
          );
        } else if (data) {
          setStatus("success");
          setMessage("Your email has been verified successfully.");

          // Start countdown to redirect
          const timer = setInterval(() => {
            setCountdown((prev) => {
              if (prev <= 1) {
                clearInterval(timer);
                router.push("/signin?message=email_verified");
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }
      } catch (err) {
        setStatus("error");
        setMessage("An unexpected error occurred. Please try again.");
        console.error("Email verification error:", err);
      }
    };

    void verifyEmail();
  }, [token, router]);

  return (
    <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex justify-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-xl font-bold">Native</span>
          </Link>
        </div>

        <Card className="overflow-hidden p-0">
          <CardHeader className="p-6 md:p-8">
            <CardTitle className="text-center text-2xl">
              Email Verification
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0 md:p-8">
            {status === "verifying" ? (
              <div className="space-y-4 text-center">
                <Loader2 className="text-primary mx-auto h-16 w-16 animate-spin" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">
                    Verifying your email...
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    Please wait a moment.
                  </p>
                </div>
              </div>
            ) : status === "success" ? (
              <div className="space-y-4 text-center">
                <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Email Verified!</h3>
                  <p className="text-muted-foreground text-sm">{message}</p>
                  <p className="text-muted-foreground text-xs">
                    Redirecting to sign in in {countdown} seconds...
                  </p>
                </div>
                <Button
                  onClick={() => router.push("/signin?message=email_verified")}
                  className="w-full"
                >
                  Sign In Now
                </Button>
              </div>
            ) : (
              <div className="space-y-4 text-center">
                <XCircle className="mx-auto h-16 w-16 text-red-600" />
                <div className="space-y-2">
                  <h3 className="text-lg font-semibold">Verification Failed</h3>
                  <p className="text-muted-foreground text-sm">{message}</p>
                </div>
                <Button
                  onClick={() => router.push("/signin")}
                  variant="outline"
                  className="w-full"
                >
                  Back to Sign In
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-muted flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
          <div className="flex w-full max-w-sm flex-col gap-6">
            <Card className="overflow-hidden p-0">
              <CardHeader className="p-6 md:p-8">
                <CardTitle className="text-center text-2xl">
                  Email Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-0 md:p-8">
                <div className="space-y-4 text-center">
                  <Loader2 className="text-primary mx-auto h-16 w-16 animate-spin" />
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold">Loading...</h3>
                    <p className="text-muted-foreground text-sm">
                      Please wait a moment.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
