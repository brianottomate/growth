"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { useTRPC } from "@/trpc/react";

import { NewClientDialog } from "../NewClientDialog";

/**
 * Find a company in the leads mirror and make it a prospect. The list starts
 * empty and fills as the operator types; picking one creates the prospect
 * brand (idempotent on the domain) and reads its website for a logo.
 */
export function FindLeadDialog() {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const term = q.trim();

  const leads = useQuery({
    ...trpc.leads.listDomains.queryOptions({ q: term, limit: 12, includeExcluded: true }),
    enabled: open && term.length >= 2,
  });
  const enrich = useMutation(trpc.brand.enrich.mutationOptions());
  const create = useMutation(
    trpc.leads.createProspect.mutationOptions({
      onSuccess: async (result) => {
        toast.success(result.created ? `${result.name} is a prospect` : `${result.name} was already a prospect`);
        if (result.enrichable) await enrich.mutateAsync({ id: result.brandId }).catch(() => undefined);
        setOpen(false);
        setQ("");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Search className="size-3.5" />
          Find a lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Find a lead</DialogTitle>
          <DialogDescription>Search the leads by company name or website.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Company or website"
          aria-label="Search leads"
        />
        <div className="min-h-24">
          {term.length < 2 ? null : leads.isLoading ? (
            <p className="text-muted-foreground flex items-center gap-2 py-6 text-xs">
              <Loader2 className="size-3.5 animate-spin" /> Searching
            </p>
          ) : leads.error ? (
            <p className="py-6 text-xs text-red-300">{leads.error.message}</p>
          ) : (leads.data?.items.length ?? 0) === 0 ? (
            <p className="text-muted-foreground py-6 text-xs">No lead matches “{term}”.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {leads.data!.items.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{lead.companyName ?? lead.domain}</p>
                    <p className="text-muted-foreground truncate text-[11px]">
                      {[lead.domain, [lead.city, lead.state].filter(Boolean).join(", "), lead.pms, lead.unitCount ? `${lead.unitCount} units` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0"
                    disabled={create.isPending}
                    onClick={() => create.mutate({ domainId: lead.id })}
                  >
                    <Plus className="size-3" />
                    Prospect
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
          <span>Not in the leads?</span>
          <NewClientDialog variant="outline" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
