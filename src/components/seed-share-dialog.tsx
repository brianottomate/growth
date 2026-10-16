"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { type RouterOutputs, orpc } from "@/orpc/client";

export type SeedShare = RouterOutputs["seed"]["lookalike"]["share"];

/** Meta's "Share one audience" box takes the bare number. */
const bareAccount = (id: string | null) => id?.replace(/^act_/, "") ?? null;

/** Every ID filled in, for an operator to paste into a computer-use agent. */
export function seedSharePrompt(share: SeedShare) {
  const client = bareAccount(share.clientAdAccountId);
  const clientName = share.clientAdAccountName ?? client;
  return [
    `Open ${share.adsManagerUrl} (Wander ad account).`,
    `In the audience list, find the lookalike named "${share.lookalikeName}" (audience ID ${share.metaAudienceId}).`,
    `Tick only that row and click Share.`,
    `In "Ad account ID or name", enter ${client} and choose "${clientName}". Click Share.`,
    `Confirm the row's Sharing column now says "Shared with 1 ad account" (or more) including ${clientName}.`,
    `Do not share the seed list "${share.seedName}" (ID ${share.seedMetaAudienceId}), do not edit or delete any audience, and stop and report if anything differs from these instructions.`,
  ].join(" ");
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate font-mono text-xs">{value ?? "Not set"}</p>
      </div>
      {value && <CopyButton text={value} />}
    </div>
  );
}

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-0.5 rounded-lg border px-3 py-2">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </section>
  );
}

/** The manual Ads Manager share of a Wander-account lookalike, then its detection. */
export function SeedShareDialog({
  share: initial,
  trigger,
  onShared,
}: {
  share: SeedShare;
  trigger: React.ReactNode;
  onShared?: (share: SeedShare) => void;
}) {
  const [share, setShare] = useState(initial);
  const [next, setNext] = useState<string | null>(null);
  const check = useMutation(
    orpc.seed.share.mutationOptions({
      onSuccess: (result) => {
        setShare(result);
        setNext(result.next);
        if (result.status === "shared") {
          toast.success(`Shared with ${result.clientAdAccountName}`);
          onShared?.(result);
        }
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const run = (confirmShared?: boolean) =>
    check.mutate({
      snapshotId: share.snapshotId,
      platformAudienceId: share.platformAudienceId,
      ...(confirmShared ? { confirmShared } : {}),
    });
  const client = bareAccount(share.clientAdAccountId);
  return (
    <SimpleDialog
      title={`Share with ${share.clientBrandName}`}
      description="Share the lookalike, never the seed list: a recipient account cannot build lookalikes from a shared list, and the list holds Wander's customers."
      trigger={trigger}
      scrollable
      footer={
        share.status === "not_shared" ? (
          <div className="flex flex-wrap justify-end gap-2">
            {next && (
              <Button
                variant="outline"
                disabled={check.isPending}
                onClick={() => run(true)}
              >
                Mark shared
              </Button>
            )}
            <Button disabled={check.isPending} onClick={() => run()}>
              {check.isPending ? "Checking…" : "Check share"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-3">
        {share.status === "shared" && (
          <p className="text-sm">
            Shared with {share.clientAdAccountName} ({client}).
          </p>
        )}
        {share.status === "no_client_account" && (
          <p className="text-sm text-muted-foreground">
            {share.clientBrandName} has no pinned, allowlisted Meta ad account.
            Set its Meta destination on the brand page first.
          </p>
        )}
        <Group title="Lookalike · share this">
          <Field label={share.lookalikeName} value={share.metaAudienceId} />
        </Group>
        <Group title="Client ad account">
          <Field
            label={share.clientAdAccountName ?? share.clientBrandName}
            value={client}
          />
        </Group>
        <Group title="Seed list · stays in Wander's account">
          <Field
            label={share.seedName ?? "Seed list"}
            value={share.seedMetaAudienceId}
          />
        </Group>
        <Button asChild variant="outline" size="sm">
          <a href={share.adsManagerUrl} target="_blank" rel="noreferrer">
            Ads Manager audiences · {bareAccount(share.sourceAdAccountId)}
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
        <section className="space-y-2 rounded-lg border px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium">Computer-use prompt</h4>
            <CopyButton text={seedSharePrompt(share)} />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {seedSharePrompt(share)}
          </p>
        </section>
        {next && <p className="text-xs text-muted-foreground">{next}</p>}
      </div>
    </SimpleDialog>
  );
}
