"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { launchTierGuidance, type LaunchTier } from "@/lib/launch";
import { orpc } from "@/orpc/client";

export function NewLaunchDialog({
  products,
}: {
  products: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [tier, setTier] = useState<LaunchTier>(3);
  const [targetDate, setTargetDate] = useState("");

  const create = useMutation(
    orpc.launch.create.mutationOptions({
      onSuccess: (result) => {
        setOpen(false);
        router.push(result.appUrl);
      },
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={products.length === 0}>New launch</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New launch</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="launch-name">Name</Label>
            <Input
              id="launch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Custom Charges"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="launch-product">Product</Label>
            <select
              id="launch-product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="launch-tier">Tier</Label>
            <select
              id="launch-tier"
              value={tier}
              onChange={(e) => setTier(Number(e.target.value) as LaunchTier)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {([1, 2, 3] as const).map((t) => (
                <option key={t} value={t}>
                  {launchTierGuidance[t].label} (
                  {launchTierGuidance[t].leadTime})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="launch-date">Target date</Label>
            <Input
              id="launch-date"
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </div>
          {create.error && (
            <p className="text-sm text-destructive">{create.error.message}</p>
          )}
          <Button
            className="w-full"
            disabled={!name.trim() || !productId || create.isPending}
            onClick={() =>
              create.mutate({
                name: name.trim(),
                productId,
                tier,
                ...(targetDate ? { targetDate } : {}),
              })
            }
          >
            {create.isPending && (
              <Loader2 className="mr-2 size-4 animate-spin" />
            )}
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
