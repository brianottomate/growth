"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PERFORMANCE_PLANS } from "@/lib/performance-billing";
import { orpc } from "@/orpc/client";

/**
 * Onboarding a customer was chat-only until now. A deal closing is an ops
 * moment, not a prompt, so it needs a form on the page too.
 */
export function NewAccountDialog() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [plan, setPlan] = useState<(typeof PERFORMANCE_PLANS)[number]>(
    PERFORMANCE_PLANS[0],
  );
  const [notes, setNotes] = useState("");
  const [brandId, setBrandId] = useState("");

  // An account with no brand has no pitch page, no intake link and no connect
  // link, because all three are addressed by the brand. Attaching one here is
  // what keeps a hand-created customer reachable.
  const brands = useQuery(orpc.brand.listLite.queryOptions({ input: {} }));

  const create = useMutation(
    orpc.performance.createAccount.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: [["performance"]] });
        setOpen(false);
        const slug = brands.data?.brands.find(
          (row) => row.id === result.account.brandId,
        )?.slug;
        if (slug) router.push(`/app/performance/clients/${slug}`);
      },
    }),
  );

  const submit = () =>
    create.mutate({
      name: name.trim(),
      contactName: contactName.trim() || null,
      contactEmail: contactEmail.trim() || null,
      website: website.trim() || null,
      plan: plan || null,
      status: "onboarding",
      brandId: brandId || null,
      notes: notes.trim() || null,
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Onboard a customer</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Onboard a Performance client</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="perf-name">Company</Label>
            <Input
              id="perf-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Away & Stay"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="perf-brand">Brand</Label>
            <select
              id="perf-brand"
              value={brandId}
              onChange={(event) => {
                setBrandId(event.target.value);
                const picked = brands.data?.brands.find(
                  (row) => row.id === event.target.value,
                );
                if (picked && name.trim() === "") setName(picked.name);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:ring-1 focus:ring-ring focus:outline-none"
            >
              <option value="">No brand yet</option>
              {(brands.data?.brands ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.relationship === "prospect" ? " (prospect)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The pitch, intake and connect links all hang off the brand, so an
              account without one cannot be sent to the customer.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="perf-contact">Contact</Label>
              <Input
                id="perf-contact"
                value={contactName}
                onChange={(event) => setContactName(event.target.value)}
                placeholder="Brad Levine"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perf-email">Email</Label>
              <Input
                id="perf-email"
                type="email"
                value={contactEmail}
                onChange={(event) => setContactEmail(event.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="perf-website">Website</Label>
              <Input
                id="perf-website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="perf-plan">Plan</Label>
              <select
                id="perf-plan"
                value={plan}
                onChange={(event) =>
                  setPlan(
                    event.target.value as (typeof PERFORMANCE_PLANS)[number],
                  )
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PERFORMANCE_PLANS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="perf-notes">Notes</Label>
            <Textarea
              id="perf-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Billed amount, media split, anything agreed on the call."
              rows={3}
            />
          </div>
          {create.error && (
            <p className="text-xs text-red-300">{create.error.message}</p>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={!name.trim() || create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
