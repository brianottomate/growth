"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SeedShareDialog } from "@/components/seed-share-dialog";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { type RouterOutputs, orpc } from "@/orpc/client";
import {
  NewSeedList,
  type NewSeedListContext,
} from "@/app/app/performance/clients/[brandSlug]/NewSeedList";

type Delivery = RouterOutputs["seed"]["deliveries"][number];

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
 * One line in an ad set: which seed list it uses, where that stands on Meta,
 * and the one next step. Wander traveler lists go through Wander's account and
 * reach the brand as a shared lookalike; the brand's own guests go straight to
 * its account.
 */
export function SeedLookalikeStep({
  brandId,
  brandName,
  campaignAudienceId,
  seedContext,
  display = "section",
}: {
  brandId: string;
  brandName: string;
  campaignAudienceId: string;
  seedContext?: NewSeedListContext;
  /** "row": a read-only line, shown only once a lookalike is in use. */
  display?: "row" | "section";
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
  const share = useMutation(orpc.seed.share.mutationOptions(options));
  const target = { type: "campaign_audience" as const, id: campaignAudienceId };

  const rows = deliveries.data ?? [];
  const d: Delivery | undefined =
    rows.find((r) => r.id === chosenId) ??
    rows.find((r) => r.linkedToCampaignAudience) ??
    rows.find((r) => r.seed) ??
    rows[0];

  if (deliveries.isPending) return null;

  const account = d?.wanderData
    ? "Wander's ad account"
    : `${brandName}'s ad account`;
  const status = !d
    ? "none"
    : d.linkedToCampaignAudience
      ? "Lookalike in use"
      : {
          built: d.warning ? "Small for a lookalike" : "Not on Meta yet",
          failed: "Upload failed",
          uploaded: "On Meta",
          lookalike: `Lookalike ready to share with ${brandName}`,
          shared: "Lookalike shared",
        }[d.stage];

  let next: React.ReactNode = null;
  if (!d) next = null;
  else if (d.stage === "built" || d.stage === "failed")
    next = (
      <Confirm
        label={`Upload ${d.summary.identifiable.toLocaleString()} and use lookalike`}
        title={`Upload seed list to ${account}, build its lookalike, use it here`}
        body={`${d.summary.identifiable.toLocaleString()} people (email and phone) from “${d.name}” go to ${account}. Meta builds a 1% US lookalike from them${d.wanderData ? `, which is shared with ${brandName}'s ad account; ${brandName} never receives the list` : ""}. The lookalike becomes this ad set's audience.${d.warning ? ` ${d.warning}` : ""}`}
        pending={upload.isPending || lookalike.isPending || share.isPending}
        onConfirm={async () => {
          const uploaded = await upload.mutateAsync({
            seedListId: d.id,
            approved: true,
          });
          // Meta may still be matching the list; each later step stays
          // available on its own for a second try.
          const built = await lookalike
            .mutateAsync({
              seedListId: d.id,
              seedPlatformAudienceId: uploaded.platformAudienceId,
              country: "US",
              ratio: 0.01,
              approved: true,
            })
            .catch(() => null);
          if (built)
            await share
              .mutateAsync({
                seedListId: d.id,
                platformAudienceId: built.platformAudienceId,
                target,
              })
              .catch(() => undefined);
        }}
      />
    );
  else if (d.stage === "uploaded" && d.seed)
    next = (
      <Confirm
        label="Create lookalike"
        title={`Create a 1% US lookalike in ${account}`}
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
  else if (d.stage === "lookalike" && d.share)
    next = (
      <Confirm
        label={`Share with ${brandName} and use here`}
        title={`Share the lookalike with ${brandName}'s ad account`}
        body={`Meta shares “${d.share.lookalikeName}” with ${d.share.clientAdAccountName ?? d.share.clientAdAccountId} for targeting, and this ad set uses it. The seed list stays in Wander's account.`}
        pending={share.isPending}
        onConfirm={() =>
          share.mutateAsync({
            seedListId: d.id,
            platformAudienceId: d.share!.platformAudienceId,
            target,
          })
        }
      />
    );
  else if (d.share?.sharedPlatformAudienceId && !d.linkedToCampaignAudience)
    next = (
      <Button
        size="sm"
        loading={attach.isPending}
        onClick={() =>
          attach.mutate({
            seedListId: d.id,
            platformAudienceId: d.share!.sharedPlatformAudienceId!,
            target,
          })
        }
      >
        Use here
      </Button>
    );

  if (display === "row")
    return d?.linkedToCampaignAudience ? (
      <p className="text-sm">
        <span className="text-muted-foreground">Seed </span>
        {d.name} · lookalike in use
      </p>
    ) : null;

  return (
    <section className="space-y-3 border-t pt-4">
      <div>
        <h4 className="text-sm font-medium">Seed lookalike</h4>
        <p className="text-xs text-muted-foreground">
          Optional. A seed list becomes a lookalike this ad set targets.
          {d?.wanderData
            ? ` Wander travelers go to Wander's ad account; ${brandName} only receives the shared lookalike.`
            : ""}
        </p>
      </div>
      {rows.length > 0 && d ? (
        <>
          <SimpleSelect
            value={d.id}
            onValueChange={setChosenId}
            options={rows.map((r) => ({
              value: r.id,
              label: `${r.name} · ${r.summary.identifiable.toLocaleString()}`,
            }))}
          />
          <p className="text-sm text-muted-foreground">
            {d.builtFrom} · {status}
          </p>
          {d.lookalike && (
            <p className="text-sm">
              <span className="text-muted-foreground">Lookalike </span>
              {d.lookalike.name}
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {d.lookalike.metaAudienceId}
              </span>
            </p>
          )}
          {d.warning && d.stage === "built" && (
            <p className="text-xs text-muted-foreground">{d.warning}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {next}
            {d.share && (
              <SeedShareDialog
                share={d.share}
                trigger={
                  <Button size="sm" variant="ghost">
                    IDs and share prompt
                  </Button>
                }
              />
            )}
            {seedContext && <NewSeedList context={seedContext} />}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            No seed lists for {brandName} yet.
          </p>
          {seedContext && <NewSeedList context={seedContext} />}
        </div>
      )}
    </section>
  );
}
