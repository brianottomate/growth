"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { PitchChatButton } from "../PitchChatButton";
import { SiteTag } from "../SiteTag";
import { NewClientDialog } from "../NewClientDialog";

/** Server-backed lead discovery, kept separate from the local prospect list. */
export function ProspectSearch({
  prospectDomains,
  term,
}: {
  prospectDomains: string[];
  term: string;
}) {
  const router = useRouter();
  const domainKey = (value: string) => {
    try {
      return new URL(
        value.includes("://") ? value : `https://${value}`,
      ).hostname
        .toLowerCase()
        .replace(/^www\./, "");
    } catch {
      return value.toLowerCase().replace(/^www\./, "");
    }
  };
  const have = new Set(prospectDomains.map(domainKey));
  const leads = useQuery({
    ...orpc.leads.listDomains.queryOptions({
      input: { q: term, limit: 24, includeExcluded: true },
    }),
    enabled: term.length >= 2,
  });
  const enrich = useMutation(
    orpc.brand.enrich.mutationOptions({ onSettled: () => router.refresh() }),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const create = useMutation(
    orpc.leads.createProspect.mutationOptions({
      onMutate: (input) => setPendingId(input.domainId),
      onSuccess: (result) => {
        toast.success(
          result.created
            ? `${result.name} added`
            : `${result.name} is already a prospect`,
        );
        router.refresh();
        if (result.created) enrich.mutate({ brandId: result.brandId });
      },
      onError: (error) => toast.error(error.message),
      onSettled: () => setPendingId(null),
    }),
  );
  const items = (leads.data?.items ?? [])
    .filter((lead) => !have.has(domainKey(lead.domain)))
    .slice(0, 8);
  if (leads.isError)
    return (
      <p role="alert" className="text-xs text-destructive">
        Could not search leads.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void leads.refetch()}
        >
          Retry
        </button>
      </p>
    );
  if (leads.isLoading)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Searching leads…
      </p>
    );
  if (!items.length)
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>No new leads match “{term}”.</span>
        <NewClientDialog variant="outline" />
      </div>
    );
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
      {items.map((lead) => (
        <li
          key={lead.id}
          className="flex flex-wrap items-center gap-3 px-4 py-2.5"
        >
          <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] @3xl:basis-0">
            <span className="text-[13px] font-semibold">
              {lead.companyName ?? lead.domain}
            </span>
            <span className="ml-2 text-[11.5px] text-muted-foreground">
              {[
                [lead.city, lead.state].filter(Boolean).join(", "),
                lead.unitCount ? `${lead.unitCount} units` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <div className="mt-1">
              <SiteTag website={lead.domain} />
            </div>
          </div>
          <PitchChatButton
            name={lead.companyName ?? lead.domain}
            domain={lead.domain}
          />
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate({ domainId: lead.id })}
            className="shrink-0 rounded-full border border-border/80 px-3 py-1 text-[11.5px] font-semibold whitespace-nowrap hover:bg-muted/60"
          >
            {pendingId === lead.id ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="size-3 animate-spin" />
                Adding
              </span>
            ) : (
              "+ Add as prospect"
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
