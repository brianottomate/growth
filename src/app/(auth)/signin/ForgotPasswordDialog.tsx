"use client";

import { useEffect, useState } from "react";
import { Mail, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleDialog } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authClient } from "@/server/better-auth/client";
import {
  DEFAULT_PASSWORD_RESET_REDIRECT,
  getEmailInboxUrl,
  getEmailProviderName,
} from "@/lib/auth-utils";

interface ForgotPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultEmail?: string;
}

export function ForgotPasswordDialog({
  open,
  onOpenChange,
  defaultEmail = "",
}: ForgotPasswordDialogProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Reset form when dialog opens to ensure it uses the current defaultEmail
  useEffect(() => {
    if (open) {
      setEmail(defaultEmail);
    }
  }, [open, defaultEmail]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await authClient.requestPasswordReset({
        email,
        redirectTo: DEFAULT_PASSWORD_RESET_REDIRECT,
      });

      if (error) {
        setError(error.message ?? "Failed to send reset email");
      } else {
        setSuccess(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: DEFAULT_PASSWORD_RESET_REDIRECT,
      });
    } catch (err) {
      console.error("Error resending password reset email", err);
      setError("Failed to resend email. Please try again.");
    }
  };

  const handleClose = () => {
    setEmail(defaultEmail);
    setError(null);
    setSuccess(false);
    onOpenChange(false);
  };

  return (
    <SimpleDialog
      open={open}
      onOpenChange={handleClose}
      title="Reset your password"
      description="Enter your email address and we'll send you a link to reset your password"
      size="sm"
    >
      <div className="space-y-4 py-2">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success ? (
          <div className="space-y-4 py-4">
            <div className="rounded-md bg-green-50 p-3 text-sm text-green-600">
              <p>
                Password reset email sent to{" "}
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
                  onClick={handleResend}
                  className="text-xs underline hover:no-underline"
                >
                  resend email
                </button>
              </div>
            </div>
            <Button onClick={handleClose} className="w-full">
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input
                id="reset-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" className="flex-1" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Reset Email
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </SimpleDialog>
  );
}
