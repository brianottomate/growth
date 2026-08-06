"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Link2,
  Loader2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ChannelLogo } from "@/components/channel-logos";
import { useTRPC } from "@/trpc/react";

const VERDICT_META = {
  ok: { icon: CheckCircle2, cls: "text-emerald-600", label: "Live" },
  inactive: {
    icon: CircleSlash,
    cls: "text-amber-600",
    label: "Linked but not live",
  },
  missing: { icon: AlertTriangle, cls: "text-red-600", label: "No campaign" },
} as const;

const fmtUsd = (n: number | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;

/**
 * Intent vs. actual for one initiative: does the strategy layer
 * (targetChannels / budget / dates) match the Zernio-synced campaigns?
 * Read-only diagnostics — the only actions are link/unlink (relationship
 * fixes); campaign changes happen in the platform's own manager.
 */
export function AlignmentPanel({
  initiativeId,
  onChanged,
}: {
  initiativeId: string;
  onChanged: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    trpc.initiative.alignment.queryOptions({ initiativeId }),
  );

  const invalidate = async () => {
    await queryClient.invalidateQueries(
      trpc.initiative.alignment.queryOptions({ initiativeId }),
    );
    await onChanged();
  };

  const linkCampaigns = useMutation(
    trpc.initiative.linkCampaigns.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to link"),
    }),
  );
  const unlinkCampaign = useMutation(
    trpc.initiative.unlinkCampaign.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to unlink"),
    }),
  );

  if (isLoading || !data) {
    return (
      <section className="mt-10">
        <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          Intent vs. actual
        </h2>
        <div className="text-muted-foreground mt-4 flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" /> Checking alignment…
        </div>
      </section>
    );
  }

  const { channels, unplanned, budget, dateDrift, suggestions } = data;
  const hasIntent = channels.length > 0 || budget.intended != null;

  return (
    <section className="mt-10">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
        Intent vs. actual
      </h2>

      {!hasIntent && (
        <p className="text-muted-foreground mt-4 text-sm">
          No intended channels or budget set on this initiative — add target
          channels to compare strategy against what&apos;s running.
        </p>
      )}

      {/* Channel coverage: one row per intended platform. */}
      {channels.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {channels.map((ch) => {
            const m = VERDICT_META[ch.verdict];
            const Icon = m.icon;
            return (
              <div
                key={ch.platform}
                className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                <ChannelLogo platform={ch.platform} className="size-4" />
                <span className="min-w-0 flex-1 truncate text-sm capitalize">
                  {ch.platform.replace(/_/g, " ")}
                  {ch.campaigns.length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {ch.campaigns.length} campaign
                      {ch.campaigns.length === 1 ? "" : "s"}
                    </span>
                  )}
                </span>
                <span className={`flex items-center gap-1.5 text-xs ${m.cls}`}>
                  <Icon className="size-3.5" /> {m.label}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Budget pacing. */}
      {budget.intended != null && (
        <div className="text-muted-foreground mt-3 text-sm">
          Spend {fmtUsd(budget.linkedSpend)} of {fmtUsd(budget.intended)}{" "}
          intended
          {budget.utilization != null && (
            <span className={budget.overIntended ? "text-red-600" : ""}>
              {" "}
              ({Math.round(budget.utilization * 100)}%)
            </span>
          )}
        </div>
      )}

      {/* Drift callouts. */}
      {unplanned.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm">
          <span className="font-medium text-amber-700">
            {unplanned.length} unplanned campaign
            {unplanned.length === 1 ? "" : "s"}
          </span>{" "}
          <span className="text-muted-foreground">
            running on channels this initiative didn&apos;t target:{" "}
            {unplanned.map((c) => c.name).join(", ")}
          </span>
        </div>
      )}
      {dateDrift.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 text-sm">
          <span className="font-medium text-amber-700">
            {dateDrift.length} campaign{dateDrift.length === 1 ? "" : "s"} run
            past the initiative end date
          </span>{" "}
          <span className="text-muted-foreground">
            {dateDrift.map((c) => c.name).join(", ")}
          </span>
        </div>
      )}

      {/* Suggested links: unlinked campaigns that plausibly implement this. */}
      {suggestions.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-muted-foreground text-xs font-medium">
              Suggested links · {suggestions.length}
            </h3>
            <Button
              size="sm"
              variant="outline"
              disabled={linkCampaigns.isPending}
              onClick={() =>
                linkCampaigns.mutate({
                  initiativeId,
                  campaignIds: suggestions.map((s) => s.id),
                })
              }
            >
              <Link2 className="size-3.5" /> Link all
            </Button>
          </div>
          <div className="mt-2 flex flex-col gap-1.5">
            {suggestions.map((s) => (
              <div
                key={s.id}
                className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <ChannelLogo platform={s.platform} className="size-4" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-muted-foreground text-[10px] capitalize">
                  {s.status}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={linkCampaigns.isPending}
                  onClick={() =>
                    linkCampaigns.mutate({
                      initiativeId,
                      campaignIds: [s.id],
                    })
                  }
                >
                  Link
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked-campaign unlink affordance, grouped per channel. */}
      {channels.some((c) => c.campaigns.length > 0) && (
        <div className="mt-4">
          <h3 className="text-muted-foreground text-xs font-medium">
            Linked campaigns
          </h3>
          <div className="mt-2 flex flex-col gap-1.5">
            {channels
              .flatMap((c) => c.campaigns)
              .map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 px-1 text-sm"
                >
                  <ChannelLogo platform={c.platform} className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                  <span className="text-muted-foreground text-xs">
                    {fmtUsd(c.spend)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={unlinkCampaign.isPending}
                    onClick={() =>
                      unlinkCampaign.mutate({ initiativeId, campaignId: c.id })
                    }
                  >
                    Unlink
                  </Button>
                </div>
              ))}
          </div>
        </div>
      )}
    </section>
  );
}
