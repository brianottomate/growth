"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Dropzone, MEDIA_ACCEPT } from "@/components/ui/dropzone";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/ui/lib/utils";
import { toast } from "@/components/ui/toast";
import { useMediaUpload } from "@/app/app/media/use-media-upload";
import { homeNameFromFilename } from "@/lib/performance-ads";
import type { MediaItem } from "@/server/db/schema";
import { orpc } from "@/orpc/client";

import { HomePicker, type PickableHome } from "../HomePicker";

type Dropped = { item: MediaItem; filename: string };

/**
 * Finished creatives straight onto the wall.
 *
 * Files go into the library first, the way every upload does, then one
 * question: one static each, or one carousel of them all. The home each ad
 * is about is read off the filename when the export convention names one;
 * pinning a home here binds them all to it instead.
 */
export function CreativeDrop({
  brandId,
  homes,
  campaignId = null,
}: {
  brandId: string;
  /** Their homes; empty when their site is not connected, so a home is typed. */
  homes: PickableHome[];
  /** Land in this campaign rather than on the brand's wall. */
  campaignId?: string | null;
}) {
  const router = useRouter();
  const { uploadFiles, uploading, progress } = useMediaUpload(brandId);
  const [dropped, setDropped] = useState<Dropped[]>([]);
  const [as, setAs] = useState<"statics" | "carousel">("statics");
  const [homeId, setHomeId] = useState<string | null>(null);
  const [homeName, setHomeName] = useState("");
  const home = homeId ? (homes.find((row) => row.id === homeId) ?? null) : null;
  const byName = homes.length === 0;

  const create = useMutation(
    orpc.ads.createAdsFromAssets.mutationOptions({
      onSuccess: (result) => {
        const bound = result.ads.filter((ad) => ad.homeName).length;
        toast.success(
          `${result.ads.length} ad${result.ads.length === 1 ? "" : "s"} on the wall${
            bound < result.ads.length
              ? `, ${bound} bound to a home by filename`
              : ""
          }.`,
        );
        setDropped([]);
        setHomeId(null);
        setHomeName("");
        router.refresh();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const onFiles = async (files: File[]) => {
    const items = await uploadFiles(files);
    const rows = items.flatMap((item, index) =>
      item.assetId ? [{ item, filename: files[index]?.name ?? "" }] : [],
    );
    if (rows.length === 0) return;
    setAs("statics");
    setDropped(rows);
  };

  const guesses = dropped.map((row) => homeNameFromFilename(row.filename));
  const matched = byName
    ? guesses.filter(Boolean).length
    : guesses.filter(
        (guess) =>
          guess &&
          homes.some((row) => row.name.toLowerCase() === guess.toLowerCase()),
      ).length;

  return (
    <>
      <Dropzone
        compact
        accept={MEDIA_ACCEPT}
        onFiles={(files) => void onFiles(files)}
        uploading={uploading}
        progress={progress}
        title="Drop finished creatives here"
        hint="one static each or one carousel · saved to the library"
      />
      <SimpleDialog
        open={dropped.length > 0}
        onOpenChange={(next) => !next && setDropped([])}
        title={`${dropped.length} file${dropped.length === 1 ? "" : "s"} in the library`}
        size="default"
        footer={
          <Button
            size="sm"
            loading={create.isPending}
            onClick={() =>
              create.mutate({
                brandId,
                mediaAssetIds: dropped.map((row) => row.item.assetId!),
                as,
                propertyId: homeId ?? undefined,
                homeName: byName ? homeName.trim() || undefined : undefined,
                campaignId: campaignId ?? undefined,
              })
            }
          >
            {as === "statics"
              ? `Make ${dropped.length} static${dropped.length === 1 ? "" : "s"}`
              : "Make one carousel"}
          </Button>
        }
      >
        <div className="space-y-4">
          <ul className="flex flex-wrap gap-2">
            {dropped.map((row, index) => (
              <li key={row.item.assetId ?? index} className="w-16 space-y-1">
                {/* oxlint-disable-next-line nextjs/no-img-element */}
                <img
                  src={row.item.thumbnail ?? row.item.url}
                  alt=""
                  className="size-16 rounded-lg border object-cover"
                />
                <p
                  className="truncate text-[9px] text-muted-foreground"
                  title={row.filename}
                >
                  {guesses[index] ?? row.filename}
                </p>
              </li>
            ))}
          </ul>
          {dropped.length > 1 ? (
            <div className="space-y-1.5">
              <Label>As</Label>
              <div className="flex gap-1 rounded-full border p-0.5">
                {(
                  [
                    { id: "statics", label: `${dropped.length} statics` },
                    { id: "carousel", label: "One carousel" },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAs(option.id)}
                    disabled={option.id === "carousel" && dropped.length > 10}
                    aria-pressed={as === option.id}
                    className={cn(
                      "flex-1 rounded-full px-2.5 py-1 text-[11.5px] transition-colors disabled:opacity-40",
                      as === option.id
                        ? "bg-foreground font-medium text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {byName ? (
            <div className="space-y-1.5">
              <Label htmlFor="drop-home">
                Home{" "}
                <span className="font-normal text-muted-foreground">
                  (by name; their site is not connected)
                </span>
              </Label>
              <Input
                id="drop-home"
                value={homeName}
                onChange={(event) => setHomeName(event.target.value)}
                placeholder={
                  matched > 0
                    ? `Leave empty to read ${matched} of ${dropped.length} off the filenames`
                    : "One home for all of them, or leave empty"
                }
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Home</Label>
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate text-xs text-muted-foreground">
                  {home
                    ? `All about ${home.name}`
                    : matched > 0
                      ? `${matched} of ${dropped.length} name a home on their site`
                      : "None named; bind homes on the wall afterwards"}
                </span>
                <HomePicker
                  homes={homes}
                  picked={homeId ? [homeId] : []}
                  max={1}
                  single
                  title="Bind them all to one home"
                  label={home ? "Change" : "Pin a home"}
                  onChange={(next) => setHomeId(next[0] ?? null)}
                />
                {home ? (
                  <button
                    type="button"
                    onClick={() => setHomeId(null)}
                    className="text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </SimpleDialog>
    </>
  );
}
