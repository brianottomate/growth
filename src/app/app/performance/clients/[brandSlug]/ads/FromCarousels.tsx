"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Images } from "lucide-react";
import { orpc } from "@/orpc/client";
import { Button } from "@/components/ui/button";
import { SimpleDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import {
  IDEA_SHAPE_LABELS,
  IDEA_SHAPES,
  type IdeaDocument,
  type IdeaShape,
} from "@/lib/ad-idea-studio";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

export function FromCarousels({ brandId }: { brandId: string }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [shapes, setShapes] = useState<IdeaShape[]>(["square", "story"]);
  const [includeHero, setIncludeHero] = useState(true);
  const [copy, setCopy] = useState<IdeaDocument["copy"] | null>(null);
  const options = useQuery({
    ...orpc.ads.approvedCarousels.queryOptions({ input: { brandId } }),
    enabled: open,
  });
  useEffect(() => {
    if (!options.data) return;
    const availableIds = new Set(options.data.carousels.map((ad) => ad.id));
    setSelected((ids) => ids.filter((id) => availableIds.has(id)));
  }, [options.data]);
  const available = options.data?.carousels ?? [];
  const chosen = selected.flatMap((id) => {
    const ad = available.find((item) => item.id === id);
    return ad ? [ad] : [];
  });
  const heroCopy = copy ?? options.data?.heroCopy;
  const hero = includeHero && chosen.length >= 2;
  const create = useWorkspaceMutation(
    orpc.ads.fromCarousels.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Created ${result.created} ads · Ready for review`);
        setOpen(false);
        void client.invalidateQueries({ queryKey: orpc.ads.key() });
      },
    }),
  );
  const validHero =
    !hero ||
    Boolean(
      heroCopy?.headline.trim() &&
      heroCopy.body.trim() &&
      /^https?:\/\/\S+$/.test(heroCopy.linkUrl),
    );
  const move = (index: number, direction: number) => {
    const ids = chosen.map((ad) => ad.id);
    [ids[index], ids[index + direction]] = [
      ids[index + direction]!,
      ids[index]!,
    ];
    setSelected(ids);
  };
  return (
    <SimpleDialog
      open={open}
      onOpenChange={(next) => {
        if (create.isPending) return;
        if (next) {
          setSelected([]);
          setFilter("");
          setCopy(null);
          setBatchId(crypto.randomUUID());
        }
        setOpen(next);
      }}
      title="Create ads from approved carousels"
      size="lg"
      scrollable
      className="flex max-h-[90dvh] flex-col"
      trigger={
        <Button size="sm" variant="outline">
          <Images aria-hidden="true" className="size-3.5" />
          From carousels
        </Button>
      }
      footer={
        <Button
          size="sm"
          loading={create.isPending}
          disabled={
            !chosen.length ||
            chosen.length !== selected.length ||
            !shapes.length ||
            !validHero ||
            options.isError
          }
          onClick={() =>
            create.mutate({
              brandId,
              batchId,
              adIds: selected,
              shapes,
              ...(hero && heroCopy ? { heroCopy } : {}),
            })
          }
        >
          {create.isPending
            ? "Creating ads…"
            : `Create ${chosen.length} static${chosen.length === 1 ? "" : "s"}${hero ? " + Hero" : ""}`}
        </Button>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Use slide 1 from each approved home carousel to create new ads, ready
          for review. Every creation makes a separate set.
        </p>
        {options.isPending ? (
          <p role="status">Loading approved carousels…</p>
        ) : options.isError ? (
          <p role="alert">
            Could not load carousels.{" "}
            <Button variant="link" onClick={() => void options.refetch()}>
              Try again
            </Button>
          </p>
        ) : !available.length ? (
          <p>Approve a home carousel in Ad Studio to use it here.</p>
        ) : (
          <>
            <fieldset disabled={create.isPending} className="min-w-0 space-y-3">
              <legend className="mb-2 text-sm font-medium">
                Choose up to 10 homes
              </legend>
              <Input
                aria-label="Filter approved carousels"
                placeholder="Find a home or carousel…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {available
                  .filter((ad) =>
                    `${ad.name} ${ad.homeName}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )
                  .map((ad) => {
                    const checked = selected.includes(ad.id);
                    const disabled =
                      !checked &&
                      (chosen.length >= 10 ||
                        chosen.some((item) => item.homeId === ad.homeId));
                    return (
                      <label
                        key={ad.id}
                        className={`flex items-center gap-3 rounded-md border p-3 ${disabled ? "opacity-50" : "cursor-pointer"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() =>
                            setSelected((ids) =>
                              checked
                                ? ids.filter((id) => id !== ad.id)
                                : [...ids, ad.id],
                            )
                          }
                          aria-label={ad.name}
                          className="size-4 shrink-0"
                        />
                        {ad.preview && (
                          // oxlint-disable-next-line nextjs/no-img-element
                          <img
                            src={ad.preview}
                            alt=""
                            loading="lazy"
                            className="size-12 rounded object-cover"
                          />
                        )}
                        <span className="min-w-0 text-sm">
                          <span className="block font-medium">
                            {ad.homeName}
                          </span>
                          <span className="text-muted-foreground">
                            {ad.name}
                          </span>
                        </span>
                      </label>
                    );
                  })}
              </div>
            </fieldset>
            {chosen.length > 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Hero card order</p>
                <ol className="space-y-1">
                  {chosen.map((ad, index) => (
                    <li key={ad.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1">
                        {index + 1}. {ad.homeName}
                      </span>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move ${ad.homeName} up`}
                        disabled={create.isPending || index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Move ${ad.homeName} down`}
                        disabled={
                          create.isPending || index === chosen.length - 1
                        }
                        onClick={() => move(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <fieldset disabled={create.isPending} className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Sizes</legend>
              <div className="flex flex-wrap gap-3">
                {IDEA_SHAPES.map((shape) => (
                  <label
                    key={shape}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={shapes.includes(shape)}
                      onChange={() =>
                        setShapes((current) =>
                          current.includes(shape)
                            ? current.filter((item) => item !== shape)
                            : [...current, shape],
                        )
                      }
                    />
                    {IDEA_SHAPE_LABELS[shape]}
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeHero}
                disabled={create.isPending}
                onChange={(event) => setIncludeHero(event.target.checked)}
              />
              Include a Hero carousel (2+ homes)
            </label>
            {hero && heroCopy && (
              <fieldset disabled={create.isPending} className="space-y-3">
                <legend className="mb-2 text-sm font-medium">Hero copy</legend>
                <p className="text-xs text-muted-foreground">
                  Check the portfolio caption for the homes you selected. Each
                  card uses its home’s name.
                </p>
                <div className="space-y-1">
                  <Label htmlFor="carousel-hero-headline">Headline</Label>
                  <Input
                    id="carousel-hero-headline"
                    value={heroCopy.headline}
                    maxLength={300}
                    onChange={(event) =>
                      setCopy({ ...heroCopy, headline: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="carousel-hero-caption">Caption</Label>
                  <Textarea
                    id="carousel-hero-caption"
                    value={heroCopy.body}
                    maxLength={5000}
                    onChange={(event) =>
                      setCopy({ ...heroCopy, body: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="carousel-hero-url">Destination URL</Label>
                  <Input
                    id="carousel-hero-url"
                    type="url"
                    value={heroCopy.linkUrl}
                    onChange={(event) =>
                      setCopy({
                        ...heroCopy,
                        linkUrl: event.target.value,
                      })
                    }
                  />
                </div>
              </fieldset>
            )}
          </>
        )}
      </div>
    </SimpleDialog>
  );
}
