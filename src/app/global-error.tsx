"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

import { env } from "@/env";

/**
 * Root-level error boundary
 *
 * Catches errors at the root level, including errors in the root layout.
 * This is a fallback for errors that aren't caught by route-level error boundaries.
 *
 * See: https://nextjs.org/docs/app/api-reference/file-conventions/error#global-errorjs
 */
export default function GlobalError({
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
          is_global_error: true,
        });
        console.error(
          "❌ [Global Error Boundary] Error captured to PostHog:",
          error,
        );
      } catch (captureError) {
        console.error(
          "❌ [Global Error Boundary] Failed to capture error:",
          captureError,
        );
      }
    } else {
      console.error("❌ [Global Error Boundary] Error occurred:", error);
    }
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div
          style={{
            display: "flex",
            minHeight: "100vh",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "28rem",
              padding: "2rem",
              border: "1px solid #e5e7eb",
              borderRadius: "0.5rem",
              backgroundColor: "white",
            }}
          >
            <h1 style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
              Something went wrong
            </h1>
            <p style={{ marginTop: "1rem", color: "#6b7280" }}>
              {error.message || "An unexpected error occurred."}
            </p>
            {error.digest && (
              <p
                style={{
                  marginTop: "0.5rem",
                  fontSize: "0.875rem",
                  color: "#9ca3af",
                }}
              >
                Error ID: {error.digest}
              </p>
            )}
            <div
              style={{ marginTop: "1.5rem", display: "flex", gap: "0.5rem" }}
            >
              <button
                onClick={() => reset()}
                style={{
                  flex: 1,
                  padding: "0.5rem 1rem",
                  backgroundColor: "#3b82f6",
                  color: "white",
                  border: "none",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
              <button
                onClick={() => (window.location.href = "/")}
                style={{
                  flex: 1,
                  padding: "0.5rem 1rem",
                  backgroundColor: "white",
                  color: "#374151",
                  border: "1px solid #d1d5db",
                  borderRadius: "0.375rem",
                  cursor: "pointer",
                }}
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
