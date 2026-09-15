"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";

/**
 * Whether this client's site is one we built.
 *
 * The id is read out of their homepage's asset URLs, which is a fetch plus a
 * regex, so the answer is stored rather than rediscovered on every intake,
 * pitch view and campaign read. Both answers stick until someone presses this,
 * because the alternative is an invented interval at which a client becomes
 * likely to have migrated.
 */
export function WanderOsSiteCard({ brandId }: { brandId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [manual, setManual] = useState("");
  const [editing, setEditing] = useState(false);

  const state = useQuery(trpc.brand.websiteState.queryOptions({ brandId }));
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.brand.websiteState.queryKey({ brandId }),
    });

  const recheck = useMutation(
    trpc.brand.recheckWebsite.mutationOptions({ onSuccess: invalidate }),
  );
  const setId = useMutation(
    trpc.brand.setWebsiteId.mutationOptions({
      onSuccess: () => {
        setEditing(false);
        setManual("");
        void invalidate();
      },
    }),
  );

  const data = state.data;
  const checked = data?.checkedAt ? new Date(data.checkedAt) : null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Their booking site</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          A WanderOS site lets us read their homes directly: the intake form
          offers them instead of asking for URLs, the pitch page shows them, and
          a campaign audience knows which states they are in.
        </p>
      </div>

      <div className="rounded-xl border border-border p-4">
        {!data?.website ? (
          <p className="text-sm text-muted-foreground">
            No website on this brand yet.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                {data.websiteId ? (
                  <p className="text-sm">
                    WanderOS site ·{" "}
                    <code className="rounded bg-surface-secondary/50 px-1.5 py-0.5 font-mono text-xs">
                      {data.websiteId}
                    </code>
                  </p>
                ) : (
                  <p className="text-sm">
                    {checked
                      ? "Not a WanderOS site, as far as their homepage says."
                      : "Not checked yet."}
                  </p>
                )}
                {checked && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Last checked {checked.toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={recheck.isPending}
                  onClick={() => recheck.mutate({ brandId })}
                >
                  <RefreshCw className="size-3.5" />
                  {recheck.isPending ? "Reading…" : "Check again"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing((open) => !open)}
                >
                  {editing ? "Cancel" : "Set by hand"}
                </Button>
              </div>
            </div>

            {editing && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <Input
                  value={manual}
                  onChange={(event) => setManual(event.target.value)}
                  placeholder="659510124225759302"
                  textSize="xs"
                  monospace
                  className="w-64"
                />
                <Button
                  size="sm"
                  disabled={setId.isPending}
                  onClick={() =>
                    setId.mutate({ brandId, websiteId: manual.trim() || null })
                  }
                >
                  {setId.isPending ? "Saving…" : "Save"}
                </Button>
                <p className="w-full text-xs text-muted-foreground">
                  The id is the run of digits in their image URLs, e.g.{" "}
                  <code className="font-mono">
                    assets-websites.wander.com/&lt;id&gt;/
                  </code>
                  . Save it empty to record that they are not on WanderOS.
                </p>
                {setId.error && (
                  <p className="w-full text-xs text-red-300">
                    {setId.error.message}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
