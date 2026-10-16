"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUpRight, Share2 } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  SeedShareDialog,
  type SeedShare,
} from "@/components/seed-share-dialog";
import { orpc } from "@/orpc/client";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="truncate font-mono text-xs">{value ?? "Not set"}</p>
      </div>
      {value && <CopyButton text={value} />}
    </div>
  );
}

/** Hand-off for sharing a Wander-account lookalike with the client's ad account. */
export function SeedShareCard({ share: initial }: { share: SeedShare }) {
  const [share, setShare] = useState(initial);
  const [next, setNext] = useState<string | null>(null);
  const check = useMutation(
    orpc.seed.share.mutationOptions({
      onSuccess: (result) => {
        setShare(result);
        setNext(result.next);
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
  return (
    <div className="min-w-0 space-y-3 overflow-hidden rounded-lg border bg-card px-3.5 py-3 text-card-foreground">
      <div className="flex items-center gap-2">
        <Share2 className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">
          {share.status === "shared"
            ? `Shared with ${share.clientAdAccountName ?? share.clientAdAccountId}`
            : `Share lookalike with ${share.clientBrandName}`}
        </p>
      </div>
      <Row label={share.lookalikeName} value={share.metaAudienceId} />
      <Row
        label={`${share.clientBrandName} ad account`}
        value={share.clientAdAccountId}
      />
      {share.status === "no_client_account" && (
        <p className="text-xs text-muted-foreground">
          Pin and allowlist {share.clientBrandName}&apos;s Meta ad account on
          its brand page first.
        </p>
      )}
      {next && <p className="text-xs text-muted-foreground">{next}</p>}
      <div className="flex flex-wrap gap-2">
        <SeedShareDialog
          share={share}
          onShared={setShare}
          trigger={
            <Button variant="outline" size="sm">
              Share steps
            </Button>
          }
        />
        <Button asChild variant="outline" size="sm">
          <a href={share.adsManagerUrl} target="_blank" rel="noreferrer">
            Ads Manager audiences
            <ArrowUpRight className="size-3.5" />
          </a>
        </Button>
        {share.status === "not_shared" && (
          <Button size="sm" disabled={check.isPending} onClick={() => run()}>
            Check share
          </Button>
        )}
        {share.status === "not_shared" && next && (
          <Button
            variant="outline"
            size="sm"
            disabled={check.isPending}
            onClick={() => run(true)}
          >
            Mark shared
          </Button>
        )}
      </div>
    </div>
  );
}
