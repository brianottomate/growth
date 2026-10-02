"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Building2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/server/better-auth/client";

type OrganizationChoice = {
  id: string;
  name: string;
  slug: string | null;
  role: "owner" | "admin" | "member";
};

export function WorkspaceSelector({
  organizations,
}: {
  organizations: OrganizationChoice[];
}) {
  const [selectedId, setSelectedId] = useState(organizations[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoContinued = useRef(false);

  const continueAuthorization = useCallback(async (organizationId: string) => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const active = await authClient.organization.setActive({
        organizationId,
      });
      if (active.error) {
        throw new Error(active.error.message ?? "Could not select workspace");
      }

      const response = await authClient.oauth2.continue({
        postLogin: true,
        oauth_query: window.location.search.replace(/^\?/, ""),
      });
      if (response.error) {
        throw new Error(
          response.error.message ?? "Could not continue authorization",
        );
      }
      const redirectData = response.data as
        | { redirect_uri?: string; url?: string }
        | undefined;
      const redirectUri = redirectData?.redirect_uri ?? redirectData?.url;
      if (!redirectUri) throw new Error("Authorization did not return a URL");
      window.location.assign(redirectUri);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not select workspace",
      );
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const onlyOrganization = organizations[0];
    if (
      organizations.length === 1 &&
      onlyOrganization &&
      !autoContinued.current
    ) {
      autoContinued.current = true;
      void continueAuthorization(onlyOrganization.id);
    }
  }, [continueAuthorization, organizations]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="size-6 text-primary" />
        </div>
        <CardTitle>Choose a Wander Growth workspace</CardTitle>
        <CardDescription>
          This connector will only operate inside the selected organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {organizations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You do not belong to a Wander Growth organization yet.
          </p>
        ) : (
          organizations.map((organization) => (
            <button
              key={organization.id}
              type="button"
              onClick={() => setSelectedId(organization.id)}
              disabled={loading}
              className={`flex w-full items-center justify-between rounded-lg border p-4 text-left transition-colors ${
                selectedId === organization.id
                  ? "border-primary bg-primary/5"
                  : "hover:bg-muted"
              }`}
            >
              <span>
                <span className="block font-medium">{organization.name}</span>
                <span className="text-xs text-muted-foreground">
                  {organization.slug ?? organization.id}
                </span>
              </span>
              <span className="text-xs text-muted-foreground capitalize">
                {organization.role}
              </span>
            </button>
          ))
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          disabled={!selectedId || loading}
          onClick={() => continueAuthorization(selectedId)}
        >
          {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
          {loading ? "Connecting…" : "Continue"}
        </Button>
      </CardFooter>
    </Card>
  );
}
