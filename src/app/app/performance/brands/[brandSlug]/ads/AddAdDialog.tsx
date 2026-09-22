"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { CreativeDrop } from "./CreativeDrop";
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
 * home is picked from their site, or typed when the site is not connected.
 * The house name is filled in unless one is typed.
 */
export function AddAdDialog({
  brandId,
  homes,
  campaignId = null,
}: {
  brandId: string;
  /** Their homes; empty when their site is not connected, so the home is typed. */
  homes: PickableHome[];
  /** Land in this campaign rather than on the brand's wall. */
  campaignId?: string | null;
}) {
  const router = useRouter();
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "import">("create");
  const [format, setFormat] = useState<Format>("static");
  const [homeId, setHomeId] = useState<string | null>(null);
  const [homeName, setHomeName] = useState("");
  const [name, setName] = useState("");
  const home = homeId ? (homes.find((row) => row.id === homeId) ?? null) : null;
  const byName = homes.length === 0;

  const add = useMutation(
    trpc.ads.addAdShell.mutationOptions({
      onSuccess: (result) => {
        toast.success(
          `${result.name} is on the wall, waiting for its creative.`,
        );
        setOpen(false);
        setName("");
        setHomeId(null);
        setHomeName("");
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
      size={mode === "import" ? "lg" : "sm"}
      trigger={
        <Button size="sm" variant="outline" shape="round" density="editorial">
          <Plus className="size-3" />
          Add ad
        </Button>
      }
      footer={
        mode === "create" ? (
          <Button
            size="sm"
            loading={add.isPending}
            onClick={() =>
              add.mutate({
                brandId,
                format,
                propertyId: format === "catalog" ? null : homeId,
                homeName:
                  format === "catalog" || !byName
                    ? null
                    : homeName.trim() || null,
                campaignId,
                name: name.trim() || null,
              })
            }
          >
            Add {AD_FORMAT_LABEL[format].toLowerCase()}
          </Button>
        ) : undefined
      }
    >
      {campaignId ? (
        <div
          className="mb-4 flex gap-2"
          role="group"
          aria-label="Add ad method"
        >
          <Button
            variant={mode === "create" ? "secondary" : "ghost"}
            onClick={() => setMode("create")}
          >
            Create ad idea
          </Button>
          <Button
            variant={mode === "import" ? "secondary" : "ghost"}
            onClick={() => setMode("import")}
          >
            Import finished creative
          </Button>
        </div>
      ) : null}
      {mode === "import" && campaignId ? (
        <CreativeDrop brandId={brandId} homes={homes} campaignId={campaignId} />
      ) : (
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
                      ? "bg-foreground font-medium text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {AD_FORMAT_LABEL[option]}
                </button>
              ))}
            </div>
            {format === "catalog" ? (
              <p className="text-[11px] text-muted-foreground">
                One card per home. Meta renders the live ad from the product
                set; the cards here show the shape.
              </p>
            ) : null}
          </div>
          {format === "catalog" ? null : byName ? (
            <div className="space-y-1.5">
              <Label htmlFor="shell-home">
                Home{" "}
                <span className="font-normal text-muted-foreground">
                  (by name; their site is not connected)
                </span>
              </Label>
              <Input
                id="shell-home"
                value={homeName}
                onChange={(event) => setHomeName(event.target.value)}
                placeholder="Leave empty for an ad about no home"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Home</Label>
              <div className="flex items-center gap-2">
                {home ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-xs">
                    {/* oxlint-disable-next-line nextjs/no-img-element */}
                    <img
                      src={home.thumbUrl ?? home.imageUrl}
                      alt=""
                      className="size-5 rounded-full object-cover"
                    />
                    <span className="truncate">{home.name}</span>
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
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
          )}
          <div className="space-y-1.5">
            <Label htmlFor="shell-name">
              Name{" "}
              <span className="font-normal text-muted-foreground">
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
      )}
    </SimpleDialog>
  );
}
