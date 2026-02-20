"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { AlertCircle } from "lucide-react";

import { Button } from "@wandercom/design-system-web/ui/button";
import { Heading } from "@wandercom/design-system-web/ui/heading";
import { Text } from "@wandercom/design-system-web/ui/text";
import { Separator } from "@wandercom/design-system-web/ui/separator";
import { env } from "@/env";

/**
 * Route-level error boundary
 *
 * Catches errors in route segments and displays a user-friendly error page.
 * Captures errors to PostHog for monitoring.
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/error
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // In development, re-throw to show Next.js's detailed error overlay
  if (process.env.NODE_ENV === "development") {
    throw error;
  }

  useEffect(() => {
    // Capture error to PostHog
    if (env.NEXT_PUBLIC_POSTHOG_KEY) {
      try {
        posthog.capture("$exception", {
          $exception_message: error.message,
          $exception_type: error.name,
          $exception_stack_trace: error.stack,
          error_digest: error.digest,
        });
        console.error("❌ [Error Boundary] Error captured to PostHog:", error);
      } catch (captureError) {
        console.error(
          "❌ [Error Boundary] Failed to capture error:",
          captureError,
        );
      }
    } else {
      console.error("❌ [Error Boundary] Error occurred:", error);
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="border-primary bg-surface-primary w-full max-w-md space-y-6 rounded-2xl border p-8 shadow-lg">
        {/* Header with Icon */}
        <div className="flex items-start gap-4">
          <div className="bg-surface-secondary flex size-12 shrink-0 items-center justify-center rounded-full">
            <AlertCircle className="text-primary size-6" />
          </div>
          <div className="space-y-2">
            <Heading variant="headline-sm" as="h1">
              Something went wrong
            </Heading>
            <Text variant="body" color="secondary">
              We encountered an error while processing your request.
            </Text>
          </div>
        </div>

        <Separator />

        {/* Error Details */}
        <div className="space-y-3">
          <Text variant="body-sm" color="secondary">
            {error.message || "An unexpected error occurred."}
          </Text>
          {error.digest && (
            <Text variant="body-sm" color="tertiary">
              Error ID: {error.digest}
            </Text>
          )}
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex gap-3">
          <Button onClick={() => reset()} variant="primary" className="flex-1">
            Try again
          </Button>
          <Button
            onClick={() => (window.location.href = "/")}
            variant="secondary"
            className="flex-1"
          >
            Go home
          </Button>
        </div>
      </div>
    </div>
  );
}
