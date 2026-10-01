"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";

const formatCustomerId = (id: string) =>
  id.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3");

/**
 * The client's own Google Ads account under Wander's manager account. Made on
 * demand here, once: currency and time zone are permanent. Billing and the
 * Zernio connection are set up by a person afterwards.
 */
export function GoogleAdsAccount({
  brandSlug,
  brandName,
  account,
}: {
  brandSlug: string;
  brandName: string;
  account: { customerId: string; conversionLabel: string | null } | null;
}) {
  const router = useRouter();
  const destinations = useQuery(
    orpc.ads.destinations.queryOptions({
      input: { brandSlug, platform: "google" },
      enabled: Boolean(account),
    }),
  );
  const create = useMutation(
    orpc.ads.createGoogleAdsAccount.mutationOptions({
      onSuccess: () => router.refresh(),
    }),
  );
  const reachable = destinations.data?.destinations.some(
    (row) => row.adAccountId === account?.customerId,
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Megaphone className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">Google Ads</span>
      {account ? (
        <>
          <span
            className="rounded-full border px-2 py-0.5 text-xs"
            title={account.conversionLabel ?? "No booking conversion yet"}
          >
            {formatCustomerId(account.customerId)}
            {account.conversionLabel && ` · ${account.conversionLabel}`}
          </span>
          {destinations.isSuccess && !reachable && (
            <span className="text-xs text-muted-foreground">
              Not in Zernio yet
            </span>
          )}
        </>
      ) : (
        <Button
          size="sm"
          shape="round"
          disabled={create.isPending}
          onClick={() => {
            if (
              window.confirm(
                `Create a Google Ads account for ${brandName}? Currency (USD) and time zone (Eastern) can't be changed afterwards.`,
              )
            )
              create.mutate({ brandSlug });
          }}
        >
          {create.isPending ? "Creating…" : "Create Google Ads account"}
        </Button>
      )}
      {create.error && (
        <span role="alert" className="text-destructive">
          {create.error.message}
        </span>
      )}
    </div>
  );
}
