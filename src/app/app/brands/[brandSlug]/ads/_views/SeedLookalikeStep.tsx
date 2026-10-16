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

type Delivery = RouterOutputs["seed"]["deliveries"][number];

const MIN_ENTRIES = 1000;
const STEPS = [
  "Compiled",
  "Uploaded to Wander",
  "Lookalike created",
  "Shared with client",
  "Linked to this ad set",
] as const;

function reached(d: Delivery) {
  if (d.linkedToCampaignAudience) return 5;
  return {
    recipe: 0,
    compiled: 1,
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
 * The ad set's lookalike from Wander data: a seed list uploaded to Wander's
 * Meta account, its 1% lookalike shared to the client's account, and that
 * shared copy targeted by this campaign audience.
 */
export function SeedLookalikeStep({
  brandId,
  brandName,
  campaignId,
  campaignName,
  campaignAudienceId,
}: {
  brandId: string;
  brandName: string;
  campaignId: string;
  campaignName: string;
  campaignAudienceId: string;
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
  const compile = useMutation(orpc.seed.compile.mutationOptions(options));
  const fill = useMutation(orpc.seed.fillContacts.mutationOptions(options));
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

  let action: React.ReactNode = null;
  if (d && !d.snapshot)
    action = (
      <Button
        size="sm"
        disabled={compile.isPending}
        onClick={() => compile.mutate({ seedListId: d.seedListId })}
      >
        {compile.isPending ? "Compiling…" : "Compile"}
      </Button>
    );
  else if (d?.snapshot && entries === null)
    action = (
      <Button
        size="sm"
        disabled={fill.isPending}
        onClick={() => fill.mutate({ snapshotId: d.snapshot!.id })}
      >
        {fill.isPending ? "Filling…" : "Fill contacts"}
      </Button>
    );
  else if (d?.snapshot && (d.stage === "compiled" || d.stage === "uploading"))
    action =
      (entries ?? 0) < MIN_ENTRIES ? (
        <p className="text-xs text-muted-foreground">
          {entries} entries; upload needs {MIN_ENTRIES.toLocaleString()}.
        </p>
      ) : (
        <Confirm
          label={
            d.seed
              ? "Resume upload"
              : `Upload ${entries!.toLocaleString()} to Wander`
          }
          title="Upload seed to Wander's Meta account"
          body={`${entries!.toLocaleString()} people (email and phone) from “${d.seedListName}” go to Wander's ad account. ${brandName} never receives them.`}
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
        title="Create lookalike in Wander's account"
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
        <h4 className="text-sm font-medium">Lookalike from Wander data</h4>
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
        <AskAssistantButton
          brandId={brandId}
          brandName={brandName}
          campaignId={campaignId}
          campaignName={campaignName}
          focus="platforms"
          label="Draft a seed list in chat"
          ask={`Propose and save a seed list for ${brandName} from Wander bookers and intent near its homes, preview its size, then compile it. Stop before uploading.`}
        />
      ) : (
        <>
          {rows.length === 1 && (
            <p className="text-xs text-muted-foreground">{d.seedListName}</p>
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
