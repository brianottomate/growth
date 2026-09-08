"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, Loader2, Search } from "lucide-react";

import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

import { NewClientDialog } from "../NewClientDialog";

/**
 * The one way onto the prospects list: type a name or website, pick a lead.
 * The results list is empty until there is a query, so the page opens quiet.
 */
export function ProspectSearch({ prospectDomains }: { prospectDomains: string[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [q, setQ] = useState("");
  const term = q.trim();
  const have = new Set(prospectDomains.map((d) => d.toLowerCase()));

  const leads = useQuery({
    ...trpc.leads.listDomains.queryOptions({ q: term, limit: 8, includeExcluded: true }),
    enabled: term.length >= 2,
  });
  const enrich = useMutation(trpc.brand.enrich.mutationOptions());
  const create = useMutation(
    trpc.leads.createProspect.mutationOptions({
      onSuccess: async (result) => {
        toast.success(result.created ? `${result.name} added` : `${result.name} is already a prospect`);
        if (result.enrichable) await enrich.mutateAsync({ id: result.brandId }).catch(() => undefined);
        setQ("");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const items = leads.data?.items ?? [];
  return (
    <div className="space-y-3">
      <label className="bg-muted/40 focus-within:border-foreground/35 flex items-center gap-2.5 rounded-full border px-4 py-2.5">
        <Search className="text-muted-foreground size-3.5 shrink-0" />
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search any brand by name or URL"
          aria-label="Search leads"
          className="placeholder:text-muted-foreground w-full bg-transparent text-[13.5px] outline-none"
        />
        {leads.isLoading ? <Loader2 className="text-muted-foreground size-3.5 animate-spin" /> : null}
      </label>
      {term.length >= 2 && !leads.isLoading ? (
        items.length === 0 ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 text-xs">
            <span>No lead matches “{term}”.</span>
            <NewClientDialog variant="outline" />
          </div>
        ) : (
          <ul className="bg-card divide-y overflow-hidden rounded-2xl border">
            {items.map((lead) => {
              const added = have.has(lead.domain.toLowerCase());
              return (
                <li key={lead.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold">{lead.companyName ?? lead.domain}</span>
                    <span className="text-muted-foreground ml-2 text-[11.5px]">
                      {[lead.domain, [lead.city, lead.state].filter(Boolean).join(", "), lead.unitCount ? `${lead.unitCount} units` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={added || create.isPending}
                    onClick={() => create.mutate({ domainId: lead.id })}
                    className={cn(
                      "border-border/80 shrink-0 rounded-full border px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap",
                      added ? "text-muted-foreground" : "hover:bg-muted/60",
                    )}
                  >
                    {added ? (
                      <span className="inline-flex items-center gap-1">
                        <Check className="size-3" /> In your list
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
