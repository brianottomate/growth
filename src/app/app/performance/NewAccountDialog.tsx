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
import { useTRPC } from "@/trpc/react";

const PLANS = ["performance_plus", "performance_pro"] as const;

/**
 * Onboarding a customer was chat-only until now. A deal closing is an ops
 * moment, not a prompt, so it needs a form on the page too.
 */
export function NewAccountDialog() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [plan, setPlan] = useState<string>(PLANS[0]);
  const [notes, setNotes] = useState("");
  const [brandId, setBrandId] = useState("");

  // An account with no brand has no pitch page, no intake link and no connect
  // link, because all three are addressed by the brand. Attaching one here is
  // what keeps a hand-created customer reachable.
  const brands = useQuery(trpc.brand.listLite.queryOptions());

  const create = useMutation(
    trpc.performance.createAccount.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries({ queryKey: [["performance"]] });
        setOpen(false);
        router.push(`/app/performance/${result.account.id}`);
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
          <DialogTitle>Onboard a Performance+ customer</DialogTitle>
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
                const picked = brands.data?.find(
                  (row) => row.id === event.target.value,
                );
                if (picked && name.trim() === "") setName(picked.name);
              }}
              className="border-border bg-background focus:ring-ring w-full rounded-md border px-3 py-1.5 text-sm focus:ring-1 focus:outline-none"
            >
              <option value="">No brand yet</option>
              {(brands.data ?? []).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                  {row.relationship === "prospect" ? " (prospect)" : ""}
                </option>
              ))}
            </select>
            <p className="text-muted-foreground text-xs">
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
                onChange={(event) => setPlan(event.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                {PLANS.map((value) => (
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
          <Button
            onClick={submit}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
