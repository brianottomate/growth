"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTRPC } from "@/trpc/react";

/**
 * The internal side of /connect/[token]: mint the share link, copy it, see
 * which channels the client has connected, and revoke by regenerating.
 */
export function ClientConnectCard({ brandId }: { brandId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const status = useQuery(trpc.brand.connectStatus.queryOptions({ brandId }));
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.brand.connectStatus.queryKey({ brandId }),
    });

  const create = useMutation(
    trpc.brand.createConnectLink.mutationOptions({ onSuccess: invalidate }),
  );
  const regenerate = useMutation(
    trpc.brand.regenerateConnectLink.mutationOptions({ onSuccess: invalidate }),
  );

  const url = status.data?.url ?? null;
  const channels = status.data?.channels ?? [];
  const visible = channels.filter((row) => row.offered || row.connected);

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Client connect</h2>
        <p className="text-muted-foreground mt-0.5 text-sm">
          A no-login link the client uses to connect their own social and ad
          accounts into this brand. The link is the credential — regenerate it
          to revoke one you have already sent.
        </p>
      </div>

      <div className="border-border rounded-xl border p-4">
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-surface-secondary/50 min-w-0 flex-1 truncate rounded-md px-2.5 py-1.5 font-mono text-xs">
              {url}
            </code>
            <Button size="sm" variant="outline" onClick={copy}>
              {copied ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied ? "Copied" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={regenerate.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Regenerate the link? The one you already sent stops working.",
                  )
                ) {
                  regenerate.mutate({ brandId });
                }
              }}
            >
              <RefreshCw className="size-3.5" />
              Regenerate
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            loading={create.isPending}
            onClick={() => create.mutate({ brandId })}
          >
            <Link2 className="size-3.5" />
            Create connect link
          </Button>
        )}
        {(create.error ?? regenerate.error) && (
          <p className="mt-2 text-xs text-red-300">
            {(create.error ?? regenerate.error)?.message}
          </p>
        )}

        {visible.length > 0 && (
          <ul className="border-border mt-4 border-t text-sm">
            {/* A parked channel is hidden from the client but not from us, and
                only while nothing is connected on it. One a brand already has
                still shows, because it is still syncing. */}
            {visible.map((row) => (
              <li
                key={row.key}
                className="grid grid-cols-[max-content_1fr] items-baseline gap-x-4 border-b border-white/5 py-2"
              >
                <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <span>{row.label}</span>
                  {!row.offered && (
                    <span className="text-muted-foreground/60 text-xs">
                      hidden from client
                    </span>
                  )}
                </span>
                {row.connected ? (
                  <span className="truncate text-emerald-400">
                    {row.accounts.filter(Boolean).join(", ") || "Connected"}
                  </span>
                ) : (
                  <span className="text-muted-foreground/60">
                    Not connected
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
