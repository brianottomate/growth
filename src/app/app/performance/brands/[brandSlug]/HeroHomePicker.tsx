"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";

export type HeroOption = {
  name: string;
  url: string;
  imageUrl: string;
  thumbUrl: string | null;
};

/** Choose the brand's hero home; the previews draw from it and its photo. */
export function HeroHomePicker({
  brandId,
  options,
  featuredUrl,
  label,
}: {
  brandId: string;
  options: HeroOption[];
  featuredUrl: string | null;
  label: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const feature = useMutation(
    orpc.brand.setPreviewSource.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  if (options.length === 0) return null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Hero home</DialogTitle>
          </DialogHeader>
          <ul className="grid max-h-[70vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {options.map((option) => {
              const selected = option.url === featuredUrl;
              return (
                <li key={option.url}>
                  <button
                    type="button"
                    disabled={feature.isPending}
                    onClick={() =>
                      feature.mutate({
                        id: brandId,
                        listingUrl: option.url,
                        sourceUrl: option.imageUrl,
                      })
                    }
                    className={cn(
                      "group block w-full space-y-1.5 rounded-lg border p-1.5 text-left text-xs transition hover:border-foreground",
                      selected && "border-foreground",
                    )}
                  >
                    <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
                      {/* oxlint-disable-next-line nextjs/no-img-element */}
                      <img
                        src={option.thumbUrl ?? option.imageUrl}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                      {selected ? (
                        <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-full bg-foreground text-background">
                          <Check className="size-3" />
                        </span>
                      ) : null}
                    </div>
                    <span className="block truncate px-0.5">{option.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
