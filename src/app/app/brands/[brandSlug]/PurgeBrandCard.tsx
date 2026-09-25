"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orpc } from "@/orpc/client";

const ROWS: { key: string; label: string }[] = [
  { key: "channels", label: "Channels" },
  { key: "campaigns", label: "Campaigns" },
  { key: "platform_campaigns", label: "Platform campaigns" },
  { key: "ads", label: "Drafted ads" },
  { key: "platform_ads", label: "Platform ads" },
  { key: "audiences", label: "Audiences" },
  { key: "personas", label: "Personas" },
  { key: "content_posts", label: "Content" },
  { key: "media_assets", label: "Media" },
  { key: "ad_accounts", label: "Allowed ad accounts" },
];

/**
 * Offboarding, on the page that onboarded them.
 *
 * The counts are loaded before anything is offered, because "delete this
 * brand" means nothing until you can see it is 3 channels and 240 media files.
 * Typing the name is the gate: this cascades across 37 tables, deletes bytes
 * out of R2 and disconnects the client's platform authorisations, and none of
 * it comes back.
 */
export function PurgeBrandCard({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");

  const preview = useQuery({
    ...orpc.brand.previewPurge.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  const purge = useMutation(
    orpc.brand.purge.mutationOptions({
      onSuccess: () => router.push("/app/brands"),
    }),
  );

  const blockers = preview.data?.blockers ?? [];
  const counts = preview.data?.counts;

  if (!open) {
    return (
      <section className="rounded-xl border border-destructive/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Offboarding</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Permanently remove {brandName} and everything under it. Use this
              when a client leaves and asks for their data to be deleted.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Purge this brand
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-xl border border-destructive/40 p-4">
      <div className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-400" />
        <div>
          <h2 className="text-base font-semibold">Purge {brandName}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            This deletes the rows below, the media bytes in storage, the
            ad-account allowlist, and the client&apos;s Zernio profile with its
            connected accounts. It cannot be undone.
          </p>
        </div>
      </div>

      {preview.isPending ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Counting what would go…
        </div>
      ) : preview.error ? (
        <p className="text-sm text-red-300">{preview.error.message}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 @xl:grid-cols-4">
            {ROWS.map((row) => (
              <div key={row.key} className="text-sm">
                <span className="tabular-nums">
                  {counts?.[row.key as keyof typeof counts] ?? 0}
                </span>{" "}
                <span className="text-muted-foreground">{row.label}</span>
              </div>
            ))}
          </div>

          {blockers.length > 0 ? (
            <div className="space-y-1 rounded-md border border-amber-500/30 p-3">
              <p className="text-sm font-medium text-amber-300">
                Blocked, and deliberately so
              </p>
              {blockers.map((blocker) => (
                <p key={blocker} className="text-xs text-muted-foreground">
                  {blocker}
                </p>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={`Type ${brandName} to confirm`}
                textSize="xs"
                className="h-8 w-64"
              />
              <Button
                size="sm"
                variant="destructive"
                className="h-8"
                disabled={typed.trim() !== brandName || purge.isPending}
                loading={purge.isPending}
                onClick={() =>
                  purge.mutate({ brandId, confirmName: typed.trim() })
                }
              >
                Purge permanently
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8"
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                }}
              >
                Cancel
              </Button>
            </div>
          )}
          {purge.error && (
            <p className="text-sm text-red-300">{purge.error.message}</p>
          )}
        </>
      )}
    </section>
  );
}
