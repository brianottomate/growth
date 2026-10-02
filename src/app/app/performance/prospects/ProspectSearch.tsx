"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, Search } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

import { NewClientDialog } from "../NewClientDialog";

/**
 * The one way onto the prospects list: type a name or website, pick a lead.
 * The results list is empty until there is a query, so the page opens quiet.
 */
export function ProspectSearch({
  prospectDomains,
}: {
  prospectDomains: string[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const term = q.trim();
  const have = new Set(prospectDomains.map((d) => d.toLowerCase()));

  const leads = useQuery({
    ...orpc.leads.listDomains.queryOptions({
      input: {
        q: term,
        limit: 8,
        includeExcluded: true,
      },
    }),
    enabled: term.length >= 2,
  });
  const enrich = useMutation(
    orpc.brand.enrich.mutationOptions({
      // The logo and colours arrive a while after the row does; refresh again
      // so the row picks them up without anyone reloading.
      onSettled: () => router.refresh(),
    }),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const create = useMutation(
    orpc.leads.createProspect.mutationOptions({
      onMutate: (input) => setPendingId(input.domainId),
      onSuccess: (result) => {
        toast.success(
          result.created
            ? `${result.name} added`
            : `${result.name} is already on the desk`,
        );
        // The row appears now; the site read runs behind it.
        router.refresh();
        if (result.created) enrich.mutate({ brandId: result.brandId });
      },
      onError: (error) => toast.error(error.message),
      onSettled: () => setPendingId(null),
    }),
  );

  const items = leads.data?.items ?? [];
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2.5 rounded-full border bg-muted/40 px-4 py-2.5 focus-within:border-foreground/35">
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search any brand by name or URL"
          aria-label="Search leads"
          className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground"
        />
        {leads.isLoading ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : null}
      </label>
      {leads.isError && term.length >= 2 ? (
        <p role="alert" className="text-xs text-muted-foreground">
          Could not load leads. {leads.error.message}
        </p>
      ) : null}
      {term.length >= 2 && !leads.isLoading && !leads.isError ? (
        items.length === 0 ? (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span>No lead matches “{term}”.</span>
            <NewClientDialog variant="outline" />
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {items.map((lead) => {
              const added = have.has(lead.domain.toLowerCase());
              const pending = pendingId === lead.id;
              return (
                <li
                  key={lead.id}
                  className="flex items-center gap-3 px-4 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold">
                      {lead.companyName ?? lead.domain}
                    </span>
                    <span className="ml-2 text-[11.5px] text-muted-foreground">
                      {[
                        lead.domain,
                        [lead.city, lead.state].filter(Boolean).join(", "),
                        lead.unitCount ? `${lead.unitCount} units` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={added || create.isPending}
                    onClick={() => create.mutate({ domainId: lead.id })}
                    className={cn(
                      "shrink-0 rounded-full border border-border/80 px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap",
                      added ? "text-muted-foreground" : "hover:bg-muted/60",
                    )}
                  >
                    {added ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="size-3" /> Already on the desk
                      </span>
                    ) : pending ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" /> Adding
                      </span>
                    ) : (
                      "+ Add as prospect"
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )
      ) : null}
    </div>
  );
}
