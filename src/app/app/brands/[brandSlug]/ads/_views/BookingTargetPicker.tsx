"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orpc } from "@/orpc/client";
import { toast } from "@/components/ui/toast";
export function BookingTargetPicker({
  brandId,
  brandSlug,
  campaignId,
  targetId,
}: {
  brandId: string;
  brandSlug: string;
  campaignId: string;
  targetId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const manageHref = pathname.startsWith("/app/performance/")
    ? `/app/performance/clients/${brandSlug}/booking`
    : `/app/brands/${brandSlug}/homes`;
  const [selected, setSelected] = useState(targetId ?? "none");
  const targets = useQuery(
    orpc.homeGroups.targets.queryOptions({ input: { brandId } }),
  );
  const apply = useMutation(
    orpc.homeGroups.attachTarget.mutationOptions({
      onSuccess: () => {
        toast.success(
          "Updated the campaign's default booking link. Ad-specific links are preserved.",
        );
        router.refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  if (!targets.data?.targets.length)
    return (
      <p className="text-xs text-muted-foreground">
        <Link href={manageHref} className="underline">
          Home groups & booking targets
        </Link>
      </p>
    );
  const target = targets.data.targets.find((t) => t.id === selected);
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <Label htmlFor="campaign-booking-target">Default booking target</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger
            id="campaign-booking-target"
            className="w-full min-w-0 @lg:w-72"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Choose a booking target</SelectItem>
            {targets.data.targets.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={!target?.url || selected === targetId || apply.isPending}
          onClick={() => apply.mutate({ campaignId, targetId: selected })}
        >
          Apply booking link
        </Button>
        <Link href={manageHref} className="text-xs underline">
          Manage targets
        </Link>
      </div>
      {target?.issue && (
        <p className="text-sm" role="alert">
          {target.issue}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Sets the campaign fallback URL for Google and Meta. Existing ad-specific
        URLs stay as reviewed.
      </p>
    </div>
  );
}
