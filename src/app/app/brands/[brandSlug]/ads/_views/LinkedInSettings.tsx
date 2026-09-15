"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  LINKEDIN_CALL_TO_ACTIONS,
  LINKEDIN_COST_TYPES,
  type LinkedInCallToAction,
  type LinkedInCostType,
} from "@/lib/zernio-ads";
import { useTRPC } from "@/trpc/react";

type LinkedInConfig = {
  organizationId?: string;
  costType?: LinkedInCostType;
  unitCost?: number;
  callToAction?: string;
};

/**
 * What LinkedIn needs beyond the first-party campaign, all optional: the
 * Company Page that authors the dark posts (inferred when the ad account is
 * org-owned), a manual bid, and the CTA button. Kept on the draft so the
 * numbers are reviewable before anyone spends.
 */
export function LinkedInSettings({
  platformCampaignId,
  config,
}: {
  /** The LinkedIn platform DRAFT row the settings live on. */
  platformCampaignId: string;
  config: LinkedInConfig | undefined;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [organizationId, setOrganizationId] = useState(
    config?.organizationId ?? "",
  );
  const [costType, setCostType] = useState<LinkedInCostType | "">(
    config?.costType ?? "",
  );
  const [unitCost, setUnitCost] = useState(
    config?.unitCost != null ? String(config.unitCost) : "",
  );
  const [callToAction, setCallToAction] = useState<LinkedInCallToAction | "">(
    (config?.callToAction as LinkedInCallToAction | undefined) ?? "",
  );

  const save = useMutation(
    trpc.ads.setPlatformDraft.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );

  const parsedUnitCost = Number(unitCost);
  const unitCostValid =
    unitCost === "" || (Number.isFinite(parsedUnitCost) && parsedUnitCost > 0);
  const configured = Boolean(
    config?.organizationId || config?.costType || config?.callToAction,
  );

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {configured ? "Edit LinkedIn settings" : "LinkedIn settings"}
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3 rounded-xl border border-border bg-surface-secondary/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="li-org">Company Page id</Label>
          <Input
            id="li-org"
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
            placeholder="78563329 or urn:li:organization:78563329"
            textSize="xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Authors the dark posts. Leave empty when the ad account belongs to
            the Page; Zernio infers it.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="li-cta">Call to action</Label>
          <select
            id="li-cta"
            value={callToAction}
            onChange={(event) =>
              setCallToAction(event.target.value as LinkedInCallToAction | "")
            }
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Default (Learn more)</option>
            {LINKEDIN_CALL_TO_ACTIONS.map((value) => (
              <option key={value} value={value}>
                {value.toLowerCase().replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="li-cost-type">Bidding</Label>
          <select
            id="li-cost-type"
            value={costType}
            onChange={(event) =>
              setCostType(event.target.value as LinkedInCostType | "")
            }
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Automated (LinkedIn picks)</option>
            {LINKEDIN_COST_TYPES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="li-unit-cost">Manual bid ($, optional)</Label>
          <Input
            id="li-unit-cost"
            inputMode="decimal"
            value={unitCost}
            disabled={costType === ""}
            onChange={(event) => setUnitCost(event.target.value)}
            placeholder="2.50"
            textSize="xs"
          />
        </div>
      </div>
      {save.error && (
        <p className="text-xs text-red-300">{save.error.message}</p>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!unitCostValid}
          loading={save.isPending}
          onClick={() =>
            save.mutate({
              platformCampaignId,
              linkedin: {
                organizationId: organizationId.trim() || undefined,
                costType: costType || undefined,
                unitCost:
                  costType && unitCost !== "" ? parsedUnitCost : undefined,
                callToAction: callToAction || undefined,
              },
            })
          }
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
