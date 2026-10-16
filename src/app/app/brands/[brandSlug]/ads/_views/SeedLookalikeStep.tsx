"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { SeedShareDialog } from "@/components/seed-share-dialog";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { type RouterOutputs, orpc } from "@/orpc/client";
import {
  NewSeedList,
  type NewSeedListContext,
} from "@/app/app/performance/clients/[brandSlug]/NewSeedList";
import { AskAssistantButton } from "./AskAssistantButton";

type Delivery = RouterOutputs["seed"]["deliveries"][number];

function reached(d: Delivery) {
  if (d.linkedToCampaignAudience) return 5;
  return { built: 1, failed: 1, uploaded: 2, lookalike: 3, shared: 4 }[d.stage];
}

/** Approval gate for the two steps that write to Meta. */
function Confirm({
  label,
  title,
  body,
  pending,
  onConfirm,
}: {
  label: string;
  title: string;
  body: string;
  pending: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SimpleDialog
      title={title}
      description={body}
      open={open}
      onOpenChange={(value) => !pending && setOpen(value)}
      trigger={<Button size="sm">{label}</Button>}
      footer={
        <Button
          disabled={pending}
          onClick={async () => {
            await onConfirm();
            setOpen(false);
          }}
        >
          {pending ? "Working…" : "Approve"}
        </Button>
      }
    >
      <p className="text-xs text-muted-foreground">
        No spend. Ads are not launched.
      </p>
    </SimpleDialog>
  );
}

/**
 * The ad set's seed lookalike: a seed list uploaded to its owner's Meta
 * account (Wander's for Wander travelers, otherwise the brand's own), its 1%
 * lookalike in the client's account, and that copy targeted by this campaign
 * audience.
 */
export function SeedLookalikeStep({
  brandId,
  brandName,
  campaignId,
  campaignName,
  campaignAudienceId,
  title = "Seed lookalike",
  seedContext,
}: {
  brandId: string;
  brandName: string;
  campaignId: string;
  campaignName: string;
  campaignAudienceId: string;
  title?: string;
  seedContext?: NewSeedListContext;
}) {
  const queryClient = useQueryClient();
  const deliveries = useQuery(
    orpc.seed.deliveries.queryOptions({
      input: { brandId, campaignAudienceId },
    }),
  );
  const [chosenId, setChosenId] = useState("");
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: orpc.seed.deliveries.key() });
  const options = {
    onSuccess: () => void refresh(),
    onError: (error: Error) => toast.error(error.message),
  };
  const upload = useMutation(orpc.seed.upload.mutationOptions(options));
  const lookalike = useMutation(orpc.seed.lookalike.mutationOptions(options));
  const attach = useMutation(orpc.seed.attach.mutationOptions(options));

  const rows = deliveries.data ?? [];
  const d =
    rows.find((r) => r.id === chosenId) ??
    rows.find((r) => r.linkedToCampaignAudience) ??
    rows.find((r) => r.seed) ??
    rows[0];
  const step = d ? reached(d) : 0;
  const account = d?.wanderData
    ? "Wander's ad account"
    : `${brandName}'s ad account`;
  const steps = [
    "Built",
    d?.wanderData ? "Uploaded to Wander" : `Uploaded to ${brandName}`,
    "Lookalike created",
    d?.wanderData ? `Shared with ${brandName}` : `In ${brandName}'s account`,
    "Used in this ad set",
  ];

  let action: React.ReactNode = null;
  if (d && (d.stage === "built" || d.stage === "failed"))
    action = (
      <Confirm
        label={`Upload ${d.summary.identifiable.toLocaleString()} to Meta`}
        title={`Upload seed list to ${account}`}
        body={`${d.summary.identifiable.toLocaleString()} people (email and phone) from “${d.name}” go to ${account}.${d.wanderData ? ` ${brandName} never receives them.` : ""}${d.warning ? ` ${d.warning}` : ""}`}
        pending={upload.isPending}
        onConfirm={() =>
          upload.mutateAsync({ seedListId: d.id, approved: true })
        }
      />
    );
  else if (d?.stage === "uploaded" && d.seed)
    action = (
      <Confirm
        label="Create 1% US lookalike"
        title={`Create lookalike in ${account}`}
        body={`Meta builds a 1% US lookalike from “${d.seed.name}”, recorded as built for ${brandName}.`}
        pending={lookalike.isPending}
        onConfirm={() =>
          lookalike.mutateAsync({
            seedListId: d.id,
            seedPlatformAudienceId: d.seed!.platformAudienceId,
            country: "US",
            ratio: 0.01,
            approved: true,
          })
        }
      />
    );
  else if (d?.share && d.stage === "lookalike")
    action = (
      <SeedShareDialog
        share={d.share}
        onShared={() => void refresh()}
        trigger={<Button size="sm">Share with {brandName}</Button>}
      />
    );
  else if (d?.share?.sharedPlatformAudienceId && !d.linkedToCampaignAudience)
    action = (
      <Button
        size="sm"
        disabled={attach.isPending}
        onClick={() =>
          attach.mutate({
            seedListId: d.id,
            platformAudienceId: d.share!.sharedPlatformAudienceId!,
            target: { type: "campaign_audience", id: campaignAudienceId },
          })
        }
      >
        Use in this ad set
      </Button>
    );

  const detail = (i: number) =>
    !d
      ? null
      : i === 0
        ? `${d.summary.identifiable.toLocaleString()} people`
        : i === 1 && d.seed
          ? (d.seed.metaAudienceId ?? d.seed.status)
          : i === 2 && d.lookalike
            ? d.lookalike.metaAudienceId
            : i === 3 && d.share
              ? (d.share.clientAdAccountName ?? d.share.clientAdAccountId)
              : null;
  const copyable = (i: number) =>
    (i === 1 && d?.seed?.metaAudienceId) ||
    (i === 2 && d?.lookalike?.metaAudienceId) ||
    null;

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        {seedContext && rows.length > 0 && (
          <NewSeedList context={seedContext} />
        )}
      </div>
      {deliveries.isPending ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !d ? (
        <div className="flex flex-wrap gap-2">
          {seedContext && <NewSeedList context={seedContext} primary />}
          <AskAssistantButton
            brandId={brandId}
            brandName={brandName}
            campaignId={campaignId}
            campaignName={campaignName}
            focus="platforms"
            label="Build one in chat"
            ask={`Build a seed list for ${brandName} with seedWrite.build from the template that fits this campaign best, and tell me its size. Stop before uploading.`}
          />
        </div>
      ) : (
        <>
          {rows.length > 1 ? (
            <SimpleSelect
              value={d.id}
              onValueChange={setChosenId}
              options={rows.map((r) => ({
                value: r.id,
                label: `${r.name} · ${r.summary.identifiable.toLocaleString()}`,
              }))}
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              {d.name}
              {d.builtFrom !== d.name ? ` · ${d.builtFrom}` : ""}
            </p>
          )}
          <ol className="grid grid-cols-1 gap-1">
            {steps.map((label, i) => {
              const done = i < step;
              const value = detail(i);
              const copy = copyable(i);
              return (
                <li
                  key={label}
                  className={cn(
                    "flex min-w-0 items-center gap-2 text-xs",
                    !done && "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full border",
                      done && "border-foreground bg-foreground text-background",
                    )}
                  >
                    {done && <Check className="size-3" />}
                  </span>
                  <span className="shrink-0">{label}</span>
                  {value && (
                    <span className="truncate font-mono text-muted-foreground">
                      {value}
                    </span>
                  )}
                  {copy && <CopyButton text={copy} />}
                </li>
              );
            })}
          </ol>
          {d.warning && d.stage === "built" && (
            <p className="text-xs text-muted-foreground">{d.warning}</p>
          )}
          {d.stage === "failed" && (
            <p className="text-xs text-muted-foreground">
              The last upload failed. Upload again to create a new Meta list.
            </p>
          )}
          {action}
          {d.share && d.stage === "shared" && (
            <SeedShareDialog
              share={d.share}
              trigger={
                <Button size="sm" variant="ghost">
                  Share details
                </Button>
              }
            />
          )}
        </>
      )}
    </section>
  );
}
