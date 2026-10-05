"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChannelLogo } from "@/components/channel-logos";
import { orpc } from "@/orpc/client";
import { CampaignDialog } from "../CampaignDialog";
import { fmtRange, STATUS_META } from "../CampaignsClient";
import { AlignmentPanel } from "./AlignmentPanel";

export function CampaignDetail({ campaignId }: { campaignId: string }) {
  const queryClient = useQueryClient();
  const { data: campaign } = useQuery(
    orpc.campaign.get.queryOptions({ input: { id: campaignId } }),
  );

  const [editOpen, setEditOpen] = useState(false);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries(
        orpc.campaign.get.queryOptions({ input: { id: campaignId } }),
      ),
      queryClient.invalidateQueries(orpc.campaign.overview.queryOptions()),
      queryClient.invalidateQueries(
        orpc.campaign.alignment.queryOptions({ input: { campaignId } }),
      ),
    ]);
  };

  if (!campaign) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading campaign…
      </div>
    );
  }

  const meta = STATUS_META[campaign.status];
  const range = fmtRange(campaign.startAt, campaign.endAt);

  return (
    <div>
      <Link
        href="/app/campaigns"
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Campaigns
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className="size-3 shrink-0 rounded-full"
              style={{ background: campaign.color ?? "var(--border)" }}
            />
            <h1 className="text-2xl font-semibold tracking-tight">
              {campaign.name}
            </h1>
            <span className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 text-xs">
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              <span className={meta.cls}>{meta.label}</span>
            </span>
            {campaign.goal && (
              <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                {campaign.goal}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            {campaign.brand && <span>{campaign.brand.name}</span>}
            {range && <span>{range}</span>}
            {campaign.budget != null && (
              <span>${campaign.budget.toLocaleString()}</span>
            )}
            {campaign.landingUrl && (
              <a
                href={campaign.landingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 transition-colors hover:text-foreground"
              >
                {campaign.landingUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {campaign.description && (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {campaign.description}
            </p>
          )}
          {campaign.adCampaigns.length > 0 && (
            <div className="mt-2.5 flex items-center gap-1.5">
              {[
                ...new Set(
                  campaign.adCampaigns.map((row) => row.channel.platform),
                ),
              ].map((p) => (
                <ChannelLogo key={p} platform={p} className="size-4" />
              ))}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="size-3.5" />
          Edit
        </Button>
      </div>

      {/* ---- linked ad campaigns -------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Ad campaigns · {campaign.adCampaigns.length}
        </h2>
        {campaign.adCampaigns.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No ad campaigns linked. Paid implementations sync in under this
            campaign from the ads side.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            {campaign.adCampaigns.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
              >
                {c.channel?.platform && (
                  <ChannelLogo
                    platform={c.channel.platform}
                    className="size-4"
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {c.name}
                </span>
                <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground capitalize">
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- intent vs. actual (strategy ↔ synced reality) ----------- */}
      <AlignmentPanel campaignId={campaignId} onChanged={invalidate} />

      <CampaignDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        brands={campaign.brand ? [campaign.brand] : []}
        initial={{
          id: campaign.id,
          brandId: campaign.brandId,
          name: campaign.name,
          description: campaign.description,
          goal: campaign.goal,
          status: campaign.status,
          landingUrl: campaign.landingUrl,
          color: campaign.color,
          budget: campaign.budget,
          startAt: campaign.startAt,
          endAt: campaign.endAt,
        }}
      />
    </div>
  );
}
