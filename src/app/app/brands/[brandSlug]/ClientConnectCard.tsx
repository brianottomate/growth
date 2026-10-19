"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { orpc } from "@/orpc/client";

/**
 * The internal side of the client-facing links: mint the shared token, copy
 * either surface, see which channels the client has connected, and revoke
 * both by regenerating.
 */
/**
 * The Leadsie grant. One static link for all of Wander, not a per-brand one,
 * which is why it is a constant here and not on `connectStatus`. Duplicated
 * from wander.com's intake form deliberately: a rep regularly needs to send
 * only this — to a client who has already filed the form, or who never will —
 * and the only copy of the URL lived inside that form.
 */
const LEADSIE_URL = "https://app.leadsie.com/connect/wander/manage";
const LEADSIE_SCOPES =
  "Facebook Page · Instagram · Google Ads · Google Analytics";

export function ClientConnectCard({ brandId }: { brandId: string }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<
    "connect" | "intake" | "pitch" | "leadsie" | null
  >(null);

  const status = useQuery(
    orpc.brand.connectStatus.queryOptions({ input: { brandId } }),
  );
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.brand.connectStatus.queryKey({ input: { brandId } }),
    });

  const create = useMutation(
    orpc.brand.createConnectLink.mutationOptions({ onSuccess: invalidate }),
  );
  const regenerate = useMutation(
    orpc.brand.regenerateConnectLink.mutationOptions({ onSuccess: invalidate }),
  );

  const url = status.data?.url ?? null;
  const intakeUrl = status.data?.intakeUrl ?? null;
  const pitchUrl = status.data?.pitchUrl ?? null;
  const channels = status.data?.channels ?? [];
  const visible = channels.filter((row) => row.offered || row.connected);

  const copy = async (
    which: "connect" | "intake" | "pitch" | "leadsie",
    value: string,
  ) => {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Client connect</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Share the public sales pitch before signing. After signing, send the
          private onboarding link for brand details, ad accounts and email
          setup. Account follow-ups open a section of that same onboarding page.
          Regenerating the token revokes existing onboarding and ad preview
          links. Leadsie is a separate Wander-wide access grant, also available
          during account setup.
        </p>
      </div>

      <div className="rounded-xl border border-border p-4">
        {pitchUrl && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Sales pitch
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-surface-secondary/50 px-2.5 py-1.5 font-mono text-xs">
                {pitchUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copy("pitch", pitchUrl)}
              >
                {copied === "pitch" ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied === "pitch" ? "Copied" : "Copy"}
              </Button>
              <a
                href={`${pitchUrl}${pitchUrl.includes("?") ? "&" : "?"}noping=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Open ↗
              </a>
            </div>
          </div>
        )}

        {intakeUrl && (
          <div className="mb-3">
            <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Client onboarding
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-surface-secondary/50 px-2.5 py-1.5 font-mono text-xs">
                {intakeUrl}
              </code>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void copy("intake", intakeUrl)}
              >
                {copied === "intake" ? (
                  <Check className="size-3.5" />
                ) : (
                  <Copy className="size-3.5" />
                )}
                {copied === "intake" ? "Copied" : "Copy"}
              </Button>
              <a
                href={`${intakeUrl}${intakeUrl.includes("?") ? "&" : "?"}noping=1`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Open ↗
              </a>
            </div>
          </div>
        )}

        <div className="mb-3">
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Access grant (Leadsie)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface-secondary/50 px-2.5 py-1.5 font-mono text-xs">
              {LEADSIE_URL}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy("leadsie", LEADSIE_URL)}
            >
              {copied === "leadsie" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied === "leadsie" ? "Copied" : "Copy"}
            </Button>
            <a
              href={LEADSIE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Open ↗
            </a>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Requests: {LEADSIE_SCOPES}. Not brand-specific and not revoked by
            regenerating the token.
          </p>
        </div>

        {url && (
          <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Accounts follow-up
          </p>
        )}
        {url ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-surface-secondary/50 px-2.5 py-1.5 font-mono text-xs">
              {url}
            </code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void copy("connect", url)}
            >
              {copied === "connect" ? (
                <Check className="size-3.5" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copied === "connect" ? "Copied" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              loading={regenerate.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "Regenerate the link? The one you already sent stops working, and so do this brand's ad preview links.",
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
            Create onboarding link
          </Button>
        )}
        {(create.error ?? regenerate.error) && (
          <p className="mt-2 text-xs text-red-300">
            {(create.error ?? regenerate.error)?.message}
          </p>
        )}

        {visible.length > 0 && (
          <ul className="mt-4 border-t border-border text-sm">
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
                    <span className="text-xs text-muted-foreground/60">
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
