"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Mail, Plus } from "lucide-react";

import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export type CompetitorNewsletterRow = {
  brandId: string;
  name: string;
  logo: string | null;
  website: string | null;
  tracked: boolean;
  address: string;
  issueCount: number;
  lastReceivedAt: string | null;
  recentIssues: {
    id: string;
    subject: string;
    receivedAt: string;
    url: string | null;
    themes: string[];
  }[];
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

/**
 * Competitor-newsletter capture: subscribe to a tracked peer's newsletter using
 * its per-brand inbound address (`inspo+<brandId>@…`) and forwarded issues land
 * here. "Track" provisions the address; you paste it into the competitor's
 * signup form and confirm the double opt-in once from the Resend inbox.
 */
export function CompetitorNewsletters({
  rows,
}: {
  rows: CompetitorNewsletterRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const track = useMutation(orpc.brand.trackNewsletter.mutationOptions());
  const untrack = useMutation(orpc.brand.untrackNewsletter.mutationOptions());

  async function onTrack(row: CompetitorNewsletterRow) {
    setBusy(row.brandId);
    try {
      const r = await track.mutateAsync({ brandId: row.brandId });
      await navigator.clipboard.writeText(r.address).catch(() => undefined);
      toast.success(
        `Address copied — paste it into ${row.name}'s newsletter signup`,
      );
      router.refresh();
    } catch (e) {
      toast.error("Couldn't provision the address");
      console.error("trackNewsletter failed", e);
    } finally {
      setBusy(null);
    }
  }

  async function onUntrack(row: CompetitorNewsletterRow) {
    setBusy(row.brandId);
    try {
      await untrack.mutateAsync({ brandId: row.brandId });
      toast.success(`Stopped capturing ${row.name}'s newsletter`);
      router.refresh();
    } catch (e) {
      toast.error("Couldn't stop tracking");
      console.error("untrackNewsletter failed", e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-10 border-t pt-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Mail className="size-4" /> Competitor newsletters
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Subscribe to a tracked competitor&apos;s newsletter with its capture
        address; forwarded issues land here as inspiration. Confirm the double
        opt-in once from the Resend inbox.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No tracked competitors yet — track a brand on the Brands page to start
          capturing its newsletter.
        </p>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.brandId} className="rounded-xl border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  {row.logo ? (
                    // oxlint-disable-next-line nextjs/no-img-element
                    <img
                      src={row.logo}
                      alt=""
                      className="size-7 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <div className="size-7 shrink-0 rounded-md bg-muted" />
                  )}
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {row.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {row.tracked
                        ? `${row.issueCount} issue${row.issueCount === 1 ? "" : "s"}${
                            row.lastReceivedAt
                              ? ` · last ${fmtDate(row.lastReceivedAt)}`
                              : " · awaiting first issue"
                          }`
                        : "Not capturing yet"}
                    </div>
                  </div>
                </div>

                {row.tracked ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <CopyButton text={row.address} label="Copy address" />
                    <Button
                      variant="ghost"
                      size="sm"
                      tone="muted"
                      loading={busy === row.brandId}
                      onClick={() => onUntrack(row)}
                    >
                      Stop
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    loading={busy === row.brandId}
                    onClick={() => onTrack(row)}
                  >
                    <Plus className="size-3.5" /> Track newsletter
                  </Button>
                )}
              </div>

              {row.tracked && (
                <div className="mt-2.5 space-y-2">
                  <code className="block w-full truncate rounded-md bg-muted px-2 py-1 font-mono text-xs text-muted-foreground">
                    {row.address}
                  </code>
                  {row.recentIssues.length > 0 && (
                    <div className="flex flex-col">
                      {row.recentIssues.map((issue) => (
                        <a
                          key={issue.id}
                          href={`/app/newsletters/${issue.id}`}
                          className="-mx-1 flex items-center gap-2 rounded-md px-1 py-1.5 text-xs hover:bg-accent/40"
                        >
                          <span className="w-10 shrink-0 text-muted-foreground tabular-nums">
                            {issue.receivedAt ? fmtDate(issue.receivedAt) : "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {issue.subject}
                          </span>
                          {issue.themes.slice(0, 2).map((t) => (
                            <span
                              key={t}
                              className="hidden shrink-0 rounded-full bg-muted px-2 py-0.5 text-muted-foreground sm:inline"
                            >
                              {t}
                            </span>
                          ))}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
