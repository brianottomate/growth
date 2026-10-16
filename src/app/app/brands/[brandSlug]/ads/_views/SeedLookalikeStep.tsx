"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { SeedShareDialog } from "@/components/seed-share-dialog";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { type RouterOutputs, orpc } from "@/orpc/client";
import { AskAssistantButton } from "./AskAssistantButton";
import {
  NewSeedList,
  type NewSeedListContext,
} from "@/app/app/performance/clients/[brandSlug]/NewSeedList";

type Delivery = RouterOutputs["seed"]["deliveries"][number];

const GUIDELINE_ENTRIES = 1000;
const steps = (wanderData: boolean, brandName: string) =>
  [
    "Built",
    wanderData ? "Uploaded to Wander" : `Uploaded to ${brandName}`,
    "Lookalike created",
    wanderData ? "Shared with client" : `In ${brandName}'s account`,
    "Linked to this ad set",
  ] as const;

function reached(d: Delivery) {
  if (d.linkedToCampaignAudience) return 5;
  return {
    not_built: 0,
    built: 1,
    uploading: 1,
    uploaded: 2,
    lookalike: 3,
    shared: 4,
  }[d.stage];
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
 * account (Wander's when it holds Wander data, otherwise the brand's own), its
 * 1% lookalike in the client's account, and that copy targeted by this
 * campaign audience.
 */
export function SeedLookalikeStep({
  brandId,
  brandName,
  campaignId,
  campaignName,
  campaignAudienceId,
  seedContext,
}: {
  brandId: string;
  brandName: string;
  campaignId: string;
  campaignName: string;
  campaignAudienceId: string;
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
  const rebuild = useMutation(orpc.seed.rebuild.mutationOptions(options));
  const upload = useMutation(orpc.seed.upload.mutationOptions(options));
  const lookalike = useMutation(orpc.seed.lookalike.mutationOptions(options));
  const attach = useMutation(orpc.seed.attach.mutationOptions(options));

  const rows = deliveries.data ?? [];
  const d =
    rows.find((r) => r.seedListId === chosenId) ??
    rows.find((r) => r.linkedToCampaignAudience) ??
    rows.find((r) => r.seed) ??
    rows[0];
  const step = d ? reached(d) : 0;
  const entries = d?.snapshot?.entries ?? null;
  const wanderData = d?.wanderData === true;
  const account = wanderData
    ? "Wander's ad account"
    : `${brandName}'s ad account`;
  const STEPS = steps(wanderData, brandName);

  let action: React.ReactNode = null;
  if (d && (!d.snapshot || entries === null))
    action = (
      <Button
        size="sm"
        disabled={rebuild.isPending}
        onClick={() => rebuild.mutate({ seedListId: d.seedListId })}
      >
        {rebuild.isPending ? "Building…" : d.snapshot ? "Rebuild" : "Build"}
      </Button>
    );
  else if (d?.snapshot && (d.stage === "built" || d.stage === "uploading"))
    action = (
      <Confirm
        label={
          d.seed
            ? "Resume upload"
            : `Upload ${entries!.toLocaleString()} to Meta`
        }
        title={`Upload seed to ${account}`}
        body={`${entries!.toLocaleString()} people (email and phone) from “${d.seedListName}” go to ${account}.${wanderData ? ` ${brandName} never receives them.` : ""}${entries! < GUIDELINE_ENTRIES ? ` Below about ${GUIDELINE_ENTRIES.toLocaleString()}, Meta's lookalikes are weak.` : ""}`}
        pending={upload.isPending}
        onConfirm={() =>
          upload.mutateAsync({
            snapshotId: d.snapshot!.id,
            ...(d.seed
              ? { platformAudienceId: d.seed.platformAudienceId }
              : {}),
            approved: true,
          })
        }
      />
    );
  else if (d?.stage === "uploaded" && d.seed && d.snapshot)
    action = (
      <Confirm
        label="Create 1% US lookalike"
        title={`Create lookalike in ${account}`}
        body={`Meta builds a 1% US lookalike from “${d.seed.name}”, recorded as built for ${brandName}.`}
        pending={lookalike.isPending}
        onConfirm={() =>
          lookalike.mutateAsync({
            snapshotId: d.snapshot!.id,
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
            snapshotId: d.snapshot!.id,
            platformAudienceId: d.share!.sharedPlatformAudienceId!,
            target: { type: "campaign_audience", id: campaignAudienceId },
          })
        }
      >
        Use in this ad set
      </Button>
    );

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Seed lookalike</h4>
        {rows.length > 1 && (
          <select
            aria-label="Seed list"
            className="max-w-full min-w-0 rounded-md border bg-background p-1.5 text-xs"
            value={d?.seedListId ?? ""}
            onChange={(e) => setChosenId(e.target.value)}
          >
            {rows.map((r) => (
              <option key={r.seedListId} value={r.seedListId}>
                {r.seedListName}
              </option>
            ))}
          </select>
        )}
      </div>
      {deliveries.isPending ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !d ? (
        <div className="flex flex-wrap gap-2">
          {seedContext && <NewSeedList context={seedContext} />}
          <AskAssistantButton
            brandId={brandId}
            brandName={brandName}
            campaignId={campaignId}
            campaignName={campaignName}
            focus="platforms"
            label="Draft a seed list in chat"
            ask={`Build a seed list for ${brandName} with seedWrite.build from the template that fits this campaign best, and tell me its size. Stop before uploading.`}
          />
        </div>
      ) : (
        <>
          {rows.length === 1 && (
            <p className="text-xs text-muted-foreground">
              {d.seedListName}
              {d.builtFrom !== d.seedListName ? ` · ${d.builtFrom}` : ""}
            </p>
          )}
          <ol className="grid grid-cols-1 gap-1">
            {STEPS.map((label, i) => {
              const done = i < step;
              const detail =
                i === 0 && d.snapshot
                  ? `${(entries ?? d.snapshot.memberCount).toLocaleString()} entries`
                  : i === 1 && d.seed
                    ? d.seed.status === "ready"
                      ? d.seed.metaAudienceId
                      : `${d.seed.status} ${d.seed.uploaded ?? 0}/${d.seed.entries ?? "?"}`
                    : i === 2 && d.lookalike
                      ? (d.lookalike.sizeLabel ?? d.lookalike.metaAudienceId)
                      : i === 3 && d.share
                        ? (d.share.clientAdAccountName ??
                          d.share.clientAdAccountId)
                        : null;
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
                  {detail && (
                    <span className="truncate font-mono text-muted-foreground">
                      {detail}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {d.snapshot?.warning && entries !== null && (
            <p className="text-xs text-muted-foreground">
              {d.snapshot.warning}
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
