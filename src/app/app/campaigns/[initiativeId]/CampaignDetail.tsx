"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, ExternalLink, Link2, Loader2, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ChannelLogo } from "@/components/channel-logos";
import { PILLAR_BY_SLUG } from "@/lib/pillars";
import { useTRPC } from "@/trpc/react";
import { CampaignDialog } from "../CampaignDialog";
import { fmtRange, STATUS_META } from "../CampaignsClient";
import { MomentAmplifiers } from "./MomentAmplifiers";

const CONTENT_STATUS_LABEL: Record<string, string> = {
  slot: "Slot",
  draft: "Draft",
  discovered: "Discovered",
  pending_review: "In Review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
  rejected: "Rejected",
  archived: "Archived",
};

const fmtDay = (d: Date | null) =>
  d
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

export function CampaignDetail({ initiativeId }: { initiativeId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { data: campaign } = useQuery(
    trpc.initiative.get.queryOptions({ id: initiativeId }),
  );

  const [editOpen, setEditOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries(
        trpc.initiative.get.queryOptions({ id: initiativeId }),
      ),
      queryClient.invalidateQueries(trpc.initiative.overview.queryOptions()),
      queryClient.invalidateQueries(
        trpc.initiative.linkableContent.queryOptions({ initiativeId }),
      ),
    ]);
  };

  const unlink = useMutation(
    trpc.initiative.unlinkContent.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message || "Failed to unlink"),
    }),
  );

  if (!campaign) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
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
        className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs transition-colors"
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
            <span className="border-border flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs">
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              <span className={meta.cls}>{meta.label}</span>
            </span>
            {campaign.goal && (
              <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
                {campaign.goal}
              </span>
            )}
          </div>
          <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-3 text-sm">
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
                className="hover:text-foreground flex items-center gap-1 transition-colors"
              >
                {campaign.landingUrl.replace(/^https?:\/\//, "")}
                <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {campaign.description && (
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              {campaign.description}
            </p>
          )}
          {(campaign.targetChannels ?? []).length > 0 && (
            <div className="mt-2.5 flex items-center gap-1.5">
              {(campaign.targetChannels ?? []).map((p) => (
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

      {/* ---- linked content ------------------------------------------- */}
      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Content · {campaign.contentPosts.length}
          </h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setLinkOpen(true)}
          >
            <Link2 className="size-3.5" />
            Link content
          </Button>
        </div>

        {campaign.contentPosts.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            Nothing attached yet. Link existing pieces, or commit a moment from{" "}
            <Link href="/app/plan" className="underline underline-offset-2">
              Plan
            </Link>{" "}
            to generate them.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            {campaign.contentPosts.map((p) => {
              const pillar = p.pillar ? PILLAR_BY_SLUG[p.pillar] : undefined;
              return (
                <div
                  key={p.id}
                  className="bg-card hover:bg-accent/40 group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors"
                >
                  <Link
                    href={`/app/content/${p.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="truncate text-sm">
                      {p.title ?? "Untitled"}
                    </span>
                    <span className="border-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]">
                      {CONTENT_STATUS_LABEL[p.status] ?? p.status}
                    </span>
                    {pillar && (
                      <span
                        className="flex shrink-0 items-center gap-1 text-[11px]"
                        style={{ color: pillar.color }}
                      >
                        <span
                          className="size-1.5 rounded-full"
                          style={{ background: pillar.color }}
                        />
                        {pillar.name}
                      </span>
                    )}
                    {p.series && (
                      <span
                        className="shrink-0 text-[11px]"
                        style={{ color: p.series.color ?? undefined }}
                      >
                        {p.series.name}
                      </span>
                    )}
                  </Link>
                  <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                    {fmtDay(p.plannedAt)}
                  </span>
                  <button
                    type="button"
                    aria-label="Unlink"
                    onClick={() =>
                      unlink.mutate({ initiativeId, contentPostId: p.id })
                    }
                    className="text-muted-foreground hover:text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- linked ad campaigns -------------------------------------- */}
      <section className="mt-10">
        <h2 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
          Ad campaigns · {campaign.adCampaigns.length}
        </h2>
        {campaign.adCampaigns.length === 0 ? (
          <p className="text-muted-foreground mt-4 text-sm">
            No ad campaigns linked. Paid implementations sync in under this
            initiative from the ads side.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-1.5">
            {campaign.adCampaigns.map((c) => (
              <div
                key={c.id}
                className="bg-card flex items-center gap-3 rounded-lg border px-3 py-2.5"
              >
                {c.channel?.platform && (
                  <ChannelLogo platform={c.channel.platform} className="size-4" />
                )}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {c.name}
                </span>
                <span className="border-border text-muted-foreground rounded-full border px-1.5 py-0.5 text-[10px] capitalize">
                  {c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ---- amplifiers (earned reach) -------------------------------- */}
      <MomentAmplifiers momentId={initiativeId} />

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
          targetChannels: campaign.targetChannels,
          budget: campaign.budget,
          startAt: campaign.startAt,
          endAt: campaign.endAt,
        }}
      />

      <LinkContentDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        initiativeId={initiativeId}
        onLinked={invalidate}
      />
    </div>
  );
}

// ---- link picker -----------------------------------------------------

function LinkContentDialog({
  open,
  onOpenChange,
  initiativeId,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initiativeId: string;
  onLinked: () => Promise<void>;
}) {
  const trpc = useTRPC();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const { data: linkable, isLoading } = useQuery({
    ...trpc.initiative.linkableContent.queryOptions({ initiativeId }),
    enabled: open,
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = linkable ?? [];
    if (!needle) return list;
    return list.filter((p) =>
      (p.title ?? "").toLowerCase().includes(needle),
    );
  }, [linkable, q]);

  const link = useMutation(
    trpc.initiative.linkContent.mutationOptions({
      onSuccess: async () => {
        await onLinked();
        setPicked(new Set());
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Failed to link content"),
    }),
  );

  function toggle(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Link content</DialogTitle>
          <DialogDescription>
            Attach existing pieces from this brand to the campaign.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title…"
        />

        <div className="-mx-1 max-h-80 overflow-y-auto px-1">
          {isLoading ? (
            <div className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground py-6 text-sm">
              {q
                ? "No matches."
                : "No unattached content on this brand — everything is already part of a campaign."}
            </p>
          ) : (
            <div className="flex flex-col">
              {filtered.map((p) => (
                <label
                  key={p.id}
                  className="hover:bg-accent/40 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 transition-colors"
                >
                  <Checkbox
                    checked={picked.has(p.id)}
                    onCheckedChange={() => toggle(p.id)}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.title ?? "Untitled"}
                  </span>
                  <span className="border-border text-muted-foreground shrink-0 rounded-full border px-1.5 py-0.5 text-[10px]">
                    {CONTENT_STATUS_LABEL[p.status] ?? p.status}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-[11px] tabular-nums">
                    {fmtDay(p.plannedAt)}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={link.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() =>
              link.mutate({ initiativeId, contentPostIds: [...picked] })
            }
            disabled={picked.size === 0 || link.isPending}
          >
            {link.isPending && <Loader2 className="size-4 animate-spin" />}
            Link {picked.size > 0 ? picked.size : ""} piece
            {picked.size === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
