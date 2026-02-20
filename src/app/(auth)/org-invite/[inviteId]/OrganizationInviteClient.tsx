"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Clock } from "lucide-react";
import { useQueryState } from "nuqs";

import { useTRPC, type RouterOutputs } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useMutation } from "@tanstack/react-query";

type InvitationData = RouterOutputs["org"]["getOrgInvite"];
type SessionData = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
} | null;

interface OrganizationInviteClientProps {
  inviteId: string;
  initialInvitation: InvitationData;
  initialSession: SessionData;
}

export function OrganizationInviteClient({
  inviteId,
  initialInvitation,
  initialSession,
}: OrganizationInviteClientProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isAutoAccepting, setIsAutoAccepting] = useState(false);

  // Query param to trigger auto-accept after auth redirect
  const [autoAccept, setAutoAccept] = useQueryState("autoAccept");

  const trpc = useTRPC();

  const redirectToOrg = () => {
    const destination = initialInvitation.organization.slug
      ? `/app/org/${initialInvitation.organization.slug}`
      : "/app";
    router.push(destination);
  };

  const acceptMutation = useMutation(
    trpc.org.acceptInvitation.mutationOptions({
      onSuccess: redirectToOrg,
      onError: (err) => {
        const message = err.message || "Failed to accept invitation";
        // If user already has access, just redirect anyway
        if (message.includes("already")) {
          redirectToOrg();
        } else {
          setError(message);
          setIsAutoAccepting(false);
        }
      },
    }),
  );

  const handleAccept = () => {
    setError(null);
    acceptMutation.mutate({ invitationId: inviteId });
  };

  // Auto-accept if user just authenticated and autoAccept param is present
  useEffect(() => {
    if (
      autoAccept === "true" &&
      initialSession?.user &&
      !isAutoAccepting &&
      !acceptMutation.isPending
    ) {
      setIsAutoAccepting(true);
      void setAutoAccept(null); // Clean up query param
      handleAccept();
    }
  }, [
    autoAccept,
    initialSession?.user,
    isAutoAccepting,
    acceptMutation.isPending,
  ]);

  const formatRole = (role: string) =>
    role.charAt(0).toUpperCase() + role.slice(1);

  const getRoleColor = (role: string) => {
    switch (role) {
      case "owner":
        return "bg-amber-100 text-amber-800 border-amber-200";
      case "admin":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "member":
        return "bg-green-100 text-green-800 border-green-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="mb-2 flex justify-center">
          <div className="rounded-full bg-blue-100 p-3">
            <Building2 className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <h1 className="text-2xl font-bold">You&apos;re Invited!</h1>
        <p className="text-muted-foreground text-sm text-balance">
          Join {initialInvitation.organization.name}
        </p>
      </div>

      {/* Error alert */}
      {error && (
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Organization Preview Card */}
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="space-y-2">
              <h3 className="line-clamp-2 text-lg font-semibold">
                {initialInvitation.organization.name}
              </h3>
            </div>

            {initialInvitation.expiresAt && (
              <div className="text-muted-foreground flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4" />
                <span>
                  Expires:{" "}
                  {new Date(initialInvitation.expiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inviter info */}
        {initialInvitation.inviter && (
          <div className="flex items-center space-x-3 rounded-lg bg-gray-50 p-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={initialInvitation.inviter.image || ""} />
              <AvatarFallback>
                {initialInvitation.inviter.name?.charAt(0).toUpperCase() ||
                  initialInvitation.inviter.email?.charAt(0).toUpperCase() ||
                  "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <div className="text-sm font-medium">
                Invited by{" "}
                {initialInvitation.inviter.name ||
                  initialInvitation.inviter.email}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(initialInvitation.createdAt).toLocaleDateString()}
              </div>
            </div>
          </div>
        )}

        {/* Role badge */}
        <div className="flex justify-center">
          <Badge
            variant="outline"
            className={getRoleColor(initialInvitation.role)}
          >
            {formatRole(initialInvitation.role)} Access
          </Badge>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {initialSession?.user ? (
          // Authenticated - show accept button
          <Button
            onClick={handleAccept}
            disabled={acceptMutation.isPending || isAutoAccepting}
            className="w-full"
          >
            {acceptMutation.isPending || isAutoAccepting
              ? "Joining..."
              : "Accept Invitation"}
          </Button>
        ) : (
          // Unauthenticated - show sign up/sign in
          <>
            <Button asChild className="w-full">
              <Link
                href={`/signup?orgInviteId=${inviteId}&email=${encodeURIComponent(initialInvitation.email)}`}
              >
                Create Account & Join
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link
                href={`/signin?orgInviteId=${inviteId}&email=${encodeURIComponent(initialInvitation.email)}`}
              >
                Sign In to Join
              </Link>
            </Button>
            <div className="rounded-lg bg-blue-50 p-3 text-center text-sm">
              <p className="text-blue-900">
                Invited: <strong>{initialInvitation.email}</strong>
              </p>
              <p className="mt-1 text-xs text-blue-700">
                Make sure to sign in with this email address
              </p>
            </div>
          </>
        )}
      </div>

      {/* Back link */}
      {initialSession?.user && (
        <div className="text-center text-sm">
          <Link href="/app" className="underline underline-offset-4">
            ← Back to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
