"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { AD_FORMAT_LABEL, HAND_MADE_AD_FORMATS } from "@/lib/performance-ads";
import { useTRPC } from "@/trpc/react";

import { HomePicker, type PickableHome } from "../HomePicker";

type Format = (typeof HAND_MADE_AD_FORMATS)[number];

/**
 * An ad before its creative: decide what it is and, when it is about one,
 * which home, and it lands on the wall as a slot to drop the file into. The
 * house name is filled in unless one is typed.
 */
export function AddAdDialog({
  brandId,
  homes,
}: {
  brandId: string;
  homes: PickableHome[];
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>("static");
  const [homeId, setHomeId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const home = homeId ? (homes.find((row) => row.id === homeId) ?? null) : null;

  const add = useMutation(
    trpc.ads.addAdShell.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `${result.name} is on the wall, waiting for its creative.`,
        );
        setOpen(false);
        setName("");
        setHomeId(null);
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <SimpleDialog
      open={open}
      onOpenChange={setOpen}
      title="Add an ad"
      size="sm"
      trigger={
        <Button
          size="sm"
          variant="outline"
          className="h-7 rounded-full px-3 text-[11.5px]"
        >
          <Plus className="size-3" />
          Add ad
        </Button>
      }
      footer={
        <Button
          size="sm"
          loading={add.isPending}
          onClick={() =>
            add.mutate({
              brandId,
              format,
              propertyId: homeId,
              name: name.trim() || null,
            })
          }
        >
          Add {AD_FORMAT_LABEL[format].toLowerCase()}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Format</Label>
          <div className="flex gap-1 rounded-full border p-0.5">
            {HAND_MADE_AD_FORMATS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFormat(option)}
                aria-pressed={format === option}
                className={cn(
                  "flex-1 rounded-full px-2.5 py-1 text-[11.5px] transition-colors",
                  format === option
                    ? "bg-foreground text-background font-medium"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {AD_FORMAT_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Home</Label>
          <div className="flex items-center gap-2">
            {home ? (
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={home.thumbUrl ?? home.imageUrl}
                  alt=""
                  className="size-5 rounded-full object-cover"
                />
                <span className="truncate">{home.name}</span>
              </span>
            ) : (
              <span className="text-muted-foreground text-xs">
                About no home in particular
              </span>
            )}
            <HomePicker
              homes={homes}
              picked={homeId ? [homeId] : []}
              max={1}
              single
              title="Which home is this ad about?"
              label={home ? "Change" : "Pick a home"}
              onChange={(next) => setHomeId(next[0] ?? null)}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="shell-name">
            Name{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="shell-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="The house name, unless you type one"
          />
        </div>
      </div>
    </SimpleDialog>
  );
}
