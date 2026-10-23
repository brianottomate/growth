"use client";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
export function AddMetaDeliveryGroup({
  platformCampaignId,
  audiences,
}: {
  platformCampaignId: string;
  audiences: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false),
    [name, setName] = useState(""),
    [audienceId, setAudienceId] = useState("broad"),
    [countries, setCountries] = useState(""),
    [states, setStates] = useState(""),
    [budget, setBudget] = useState("");
  const router = useRouter();
  const save = useMutation(
    orpc.ads.addDeliveryGroup.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const codes = (s: string) =>
    s
      .split(/[\s,]+/)
      .map((v) => v.trim().toUpperCase())
      .filter(Boolean);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          save.reset();
          setOpen(true);
        }}
      >
        Add ad set
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plan another Meta ad set</DialogTitle>
          <DialogDescription>
            Uses this campaign’s approved ads. Save the draft, then review
            additions to publish it paused.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="new-meta-set-name">Ad set name</Label>
          <Input
            id="new-meta-set-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Label>Audience</Label>
          <Select value={audienceId} onValueChange={setAudienceId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="broad">Broad</SelectItem>
              {audiences.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="new-meta-set-countries">Country codes</Label>
          <Input
            id="new-meta-set-countries"
            placeholder="US"
            value={countries}
            onChange={(e) => setCountries(e.target.value)}
          />
          <Label htmlFor="new-meta-set-states">US state codes (optional)</Label>
          <Input
            id="new-meta-set-states"
            placeholder="TN, AL"
            value={states}
            onChange={(e) => setStates(e.target.value)}
          />
          <Label htmlFor="new-meta-set-budget">
            Daily ad set budget (only for ad set budgeting)
          </Label>
          <Input
            id="new-meta-set-budget"
            type="number"
            min={1}
            step={1}
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Campaign budgeting keeps the existing total budget. Ad set budgeting
            requires an explicit amount for the new set.
          </p>
        </div>
        {save.error && (
          <p className="text-sm text-destructive">{save.error.message}</p>
        )}
        <DialogFooter>
          <Button
            disabled={!name.trim() || save.isPending}
            onClick={() =>
              save.mutate({
                platformCampaignId,
                name,
                audienceId: audienceId === "broad" ? null : audienceId,
                configuration: {
                  platform: "meta_ads",
                  targeting: {
                    geography: {
                      countries: codes(countries),
                      states: codes(states),
                    },
                  },
                },
                ...(budget
                  ? { budget: Number(budget), budgetType: "daily" as const }
                  : {}),
              })
            }
          >
            {save.isPending ? "Saving…" : "Save draft ad set"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
