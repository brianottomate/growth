"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import Link from "next/link";
import {
  ExternalLink,
  House,
  Info,
  Loader2,
  Square,
  RectangleVertical,
  RectangleHorizontal,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { IDEA_SHAPE_LABELS, type IdeaShape } from "@/lib/ad-idea-studio";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  STARTER_AD_TYPES,
  type StarterAdType,
  starterAdCount,
} from "@/lib/starter-ad-ideas";
import { EmptyState } from "@/components/ui/empty-state";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

function useStudioGenerationRun(brandId: string) {
  return useQuery({
    ...orpc.ads.starterGenerationStatus.queryOptions({ input: { brandId } }),
    refetchInterval: (query) =>
      ["queued", "running"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
  });
}

const MAX_HOMES = 10;

/** Batch creation snapshots the ticked homes into the saved ads/run. */
export function StudioGeneration({
  brandId,
  brandSlug,
  connected,
}: {
  brandId: string;
  brandSlug: string;
  connected: boolean;
}) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [groupId, setGroupId] = useState("");
  const [bookingTargetId, setBookingTargetId] = useState("");
  const targets = useQuery({
    ...orpc.homeGroups.targets.queryOptions({ input: { brandId } }),
    enabled: open && connected,
  });
  const chosenTarget = targets.data?.targets.find(
    (target) => target.id === bookingTargetId,
  );
  const [groupFilter, setGroupFilter] = useState("");
  const [ai, setAi] = useState(true);
  const [batchId, setBatchId] = useState("");
  const groups = useQuery({
    ...orpc.homeGroups.context.queryOptions({ input: { brandId } }),
    enabled: open && connected,
  });
  const [selectionMode, setSelectionMode] = useState("group");
  const [homeFilter, setHomeFilter] = useState("");
  const choices = groups.data?.groups ?? [];
  const selectedGroupId =
    groupId ||
    choices.find(
      (group) => group.homeIds.length > 0 && group.homeIds.length <= MAX_HOMES,
    )?.id ||
    "";
  const selected = choices.find((group) => group.id === selectedGroupId);
  const [ticked, setTicked] = useState<string[]>([]);
  const [adTypes, setAdTypes] = useState<StarterAdType[]>([
    ...STARTER_AD_TYPES,
  ]);
  const [exportShapes, setExportShapes] = useState<IdeaShape[]>([
    "square",
    "story",
  ]);
  const homes = useQuery({
    ...orpc.ads.starterIdeaHomes.queryOptions({
      input:
        selectionMode === "individual"
          ? { brandId, allHomes: true }
          : { brandId, groupId: selectedGroupId },
    }),
    enabled:
      open &&
      connected &&
      (selectionMode === "individual" || Boolean(selected)),
  });
  const available = homes.data ?? [];
  const picked =
    selectionMode === "group"
      ? available
      : available.filter((home) => ticked.includes(home.id));
  const effectiveAdTypes = adTypes.filter(
    (type) => type !== "hero" || picked.length > 1,
  );
  const toggle = (homeId: string) =>
    setTicked((current) =>
      current.includes(homeId)
        ? current.filter((id) => id !== homeId)
        : [...current, homeId],
    );
  const progress = useStudioGenerationRun(brandId);
  const running = ["queued", "running"].includes(progress.data?.status ?? "");
  const generate = useMutation(
    orpc.ads.generateStarterIdeas.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        void progress.refetch();
        void client.invalidateQueries({ queryKey: orpc.workflow.key() });
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const starter = useWorkspaceMutation(
    orpc.ads.addStarterIdeas.mutationOptions({
      onSuccess: (result) => {
        toast.success(`Created ${result.created} starter ads`);
        setOpen(false);
      },
    }),
  );
  const pending = generate.isPending || starter.isPending;
  const ready =
    (!bookingTargetId || Boolean(chosenTarget?.url)) &&
    exportShapes.length > 0 &&
    effectiveAdTypes.length > 0 &&
    (selectionMode === "individual" ||
      available.length === selected?.homeIds.length) &&
    connected &&
    groups.data?.connected &&
    !homes.isPending &&
    !homes.isError &&
    picked.length > 0 &&
    picked.length <= MAX_HOMES &&
    picked.every((home) => home.photos.length > 0);
  const manage = (
    <Link
      href={`/app/performance/clients/${brandSlug}/wanderos`}
      className="text-sm font-medium underline underline-offset-4"
    >
      {connected ? "Manage home groups in WanderOS" : "Connect WanderOS"}
    </Link>
  );
  const batchAction = (
    <>
      {connected ? (
        <SimpleDialog
          open={open}
          onOpenChange={(next) => {
            if (!pending) {
              if (next) {
                setBatchId(crypto.randomUUID());
                setGroupFilter("");
                setGroupId("");
                setSelectionMode("group");
                setHomeFilter("");
                setAdTypes([...STARTER_AD_TYPES]);
                setTicked([]);
              }
              setOpen(next);
            }
          }}
          title="Create ads from homes"
          size="lg"
          scrollable
          className="flex max-h-[90dvh] flex-col"
          trigger={
            <Button size="sm" variant="outline" disabled={running}>
              <House aria-hidden="true" className="size-3.5" />
              From homes
            </Button>
          }
          footer={
            <Button
              size="sm"
              disabled={!ready || running}
              loading={pending}
              onClick={() => {
                const homeIds = picked.map((home) => home.id);
                if (ai)
                  generate.mutate({
                    brandId,
                    source: "featured",
                    homeIds,
                    adTypes: effectiveAdTypes,
                    bookingTargetId: bookingTargetId || undefined,
                    exportShapes,
                    intendedPlacements: [
                      ...(exportShapes.some((shape) => shape !== "story")
                        ? (["facebook-feed", "instagram-feed"] as const)
                        : []),
                      ...(exportShapes.includes("story")
                        ? (["facebook-story", "instagram-story"] as const)
                        : []),
                    ],
                  });
                else
                  starter.mutate({
                    brandId,
                    batchId,
                    exportShapes,
                    source: "featured",
                    homeIds,
                    adTypes: effectiveAdTypes,
                    bookingTargetId: bookingTargetId || undefined,
                  });
              }}
            >
              {pending
                ? "Creating ads…"
                : ai
                  ? "Generate ads with AI"
                  : "Create starter ads"}
            </Button>
          }
        >
          <div className="space-y-4">
            {groups.isPending ? (
              <p role="status">Loading home groups…</p>
            ) : groups.isError ? (
              <p role="alert">
                Could not load home groups.{" "}
                <Button variant="link" onClick={() => void groups.refetch()}>
                  Try again
                </Button>
              </p>
            ) : !groups.data.connected ? (
              <p>Connect WanderOS before creating a home-group batch.</p>
            ) : !groups.data.homes.length ? (
              <EmptyState
                compact
                icon={House}
                title="Import homes"
                description="Import homes and source photos in WanderOS."
                actions={manage}
              />
            ) : (
              <>
                <Tabs value={selectionMode} onValueChange={setSelectionMode}>
                  <TabsList aria-label="Home selection">
                    <TabsTrigger value="group" disabled={pending}>
                      Home group
                    </TabsTrigger>
                    <TabsTrigger value="individual" disabled={pending}>
                      Individual
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="group" className="space-y-3">
                    <Input
                      aria-label="Filter home groups"
                      placeholder="Filter home groups…"
                      value={groupFilter}
                      disabled={pending}
                      onChange={(event) => setGroupFilter(event.target.value)}
                    />
                    <fieldset className="space-y-2" disabled={pending}>
                      <legend className="sr-only">Home group</legend>
                      {choices
                        .filter((group) =>
                          group.name
                            .toLowerCase()
                            .includes(groupFilter.trim().toLowerCase()),
                        )
                        .map((group) => {
                          const disabled =
                            !group.homeIds.length ||
                            group.homeIds.length > MAX_HOMES;
                          const preview = group.homeIds
                            .map(
                              (id) =>
                                groups.data.homes.find((home) => home.id === id)
                                  ?.heroSourceUrl,
                            )
                            .find(Boolean);
                          return (
                            <label
                              key={group.id}
                              className={`flex items-center gap-3 rounded-lg border p-3 ${group.id === selectedGroupId ? "border-primary bg-muted/30" : "border-border"} ${disabled ? "opacity-50" : "cursor-pointer"}`}
                            >
                              <div
                                className="flex h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted"
                                aria-hidden="true"
                              >
                                <GroupPreviewPhoto url={preview ?? null} />
                              </div>
                              <span className="min-w-0 flex-1">
                                <span className="text-sm font-medium">
                                  {group.name}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {group.homeIds.length}{" "}
                                  {group.homeIds.length === 1
                                    ? "home"
                                    : "homes"}
                                  {group.homeIds.length > MAX_HOMES
                                    ? " · Maximum 10"
                                    : ""}
                                </span>
                              </span>
                              <input
                                type="radio"
                                name="studio-home-group"
                                checked={group.id === selectedGroupId}
                                disabled={disabled}
                                onChange={() => setGroupId(group.id)}
                                aria-label={group.name}
                                className="size-4 accent-primary"
                              />
                            </label>
                          );
                        })}
                    </fieldset>
                    {!choices.some((group) =>
                      group.name
                        .toLowerCase()
                        .includes(groupFilter.trim().toLowerCase()),
                    ) && (
                      <p className="text-sm text-muted-foreground">
                        No matching home groups. {manage}
                      </p>
                    )}
                    {selected && (
                      <p className="text-sm text-muted-foreground">
                        All {selected.homeIds.length} homes in this group will
                        be used.
                      </p>
                    )}
                  </TabsContent>
                  <TabsContent value="individual" className="space-y-3">
                    <Input
                      aria-label="Filter homes"
                      placeholder="Filter homes…"
                      value={homeFilter}
                      disabled={pending}
                      onChange={(event) => setHomeFilter(event.target.value)}
                    />
                    <fieldset disabled={pending}>
                      <legend className="sr-only">Individual homes</legend>
                      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {available
                          .filter((home) =>
                            home.name
                              .toLowerCase()
                              .includes(homeFilter.trim().toLowerCase()),
                          )
                          .map((home) => {
                            const on = ticked.includes(home.id);
                            return (
                              <li key={home.id} className="min-w-0 space-y-1">
                                <label
                                  className={`block cursor-pointer space-y-1 rounded-md ${on ? "" : "opacity-60"}`}
                                >
                                  <div className="relative flex h-20 overflow-hidden rounded-md bg-muted">
                                    <GroupPreviewPhoto
                                      url={home.photos[0]?.url ?? null}
                                    />
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      disabled={
                                        !on && ticked.length >= MAX_HOMES
                                      }
                                      onChange={() => toggle(home.id)}
                                      aria-label={home.name}
                                      className="absolute top-1.5 left-1.5 size-4 accent-primary"
                                    />
                                  </div>
                                  <span className="block truncate text-xs font-medium">
                                    {home.name}
                                  </span>
                                </label>
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <span>
                                    {home.photos.length
                                      ? `${home.photos.length} photos`
                                      : "Needs photos"}
                                  </span>
                                  <a
                                    href={home.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Open listing: ${home.name}`}
                                  >
                                    <ExternalLink className="size-3" />
                                  </a>
                                </div>
                              </li>
                            );
                          })}
                      </ul>
                    </fieldset>
                    {!homes.isPending &&
                      !available.some((home) =>
                        home.name
                          .toLowerCase()
                          .includes(homeFilter.trim().toLowerCase()),
                      ) && (
                        <p className="text-sm text-muted-foreground">
                          No matching homes.
                        </p>
                      )}
                  </TabsContent>
                </Tabs>
                {homes.isPending && (
                  <p role="status" className="text-sm">
                    Loading home photos…
                  </p>
                )}
                {homes.isError && (
                  <p role="alert" className="text-sm">
                    Could not load home photos.{" "}
                    <Button variant="link" onClick={() => void homes.refetch()}>
                      Try again
                    </Button>
                  </p>
                )}
                {picked.some((home) => !home.photos.length) && (
                  <p role="alert" className="text-sm">
                    Every selected home needs a source photo before generating.
                  </p>
                )}
                <fieldset className="space-y-2" disabled={pending}>
                  <legend className="mb-2 text-sm font-medium">
                    Ads to draft
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {STARTER_AD_TYPES.map((type) => {
                      const disabled = type === "hero" && picked.length < 2;
                      const checked = effectiveAdTypes.includes(type);
                      return (
                        <label
                          key={type}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${checked ? "border-primary bg-muted/30" : "border-border"} ${disabled ? "opacity-50" : "cursor-pointer"}`}
                        >
                          <input
                            type="checkbox"
                            aria-label={
                              type === "hero"
                                ? "Hero"
                                : type === "static"
                                  ? "Static"
                                  : "Carousel"
                            }
                            checked={checked}
                            disabled={disabled}
                            onChange={(event) =>
                              setAdTypes((current) =>
                                event.target.checked
                                  ? [...current, type]
                                  : current.filter((value) => value !== type),
                              )
                            }
                            className="size-4 accent-primary"
                          />
                          {type === "static"
                            ? "Static"
                            : type === "carousel"
                              ? "Carousel"
                              : "Hero"}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Static and carousel create one ad per home. Hero creates one
                    carousel across the selected homes and needs at least two.
                  </p>
                </fieldset>
                <div
                  className="rounded-lg border bg-muted/30 p-3 text-sm"
                  role="status"
                >
                  {picked.length
                    ? `${picked.length} ${picked.length === 1 ? "home" : "homes"} · ${starterAdCount(picked.length, effectiveAdTypes)} draft ads`
                    : "Select homes to make ads for"}
                </div>
                <fieldset className="space-y-2" disabled={pending}>
                  <legend className="mb-2 text-sm font-medium">
                    Creative sizes
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(["square", "story", "portrait", "wide"] as const).map(
                      (size) => {
                        const Icon =
                          size === "square"
                            ? Square
                            : size === "wide"
                              ? RectangleHorizontal
                              : RectangleVertical;
                        const checked = exportShapes.includes(size);
                        return (
                          <label
                            key={size}
                            className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${checked ? "border-primary bg-muted/30" : "border-border text-muted-foreground"}`}
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-current"
                              aria-label={IDEA_SHAPE_LABELS[size]}
                              checked={checked}
                              onChange={(event) =>
                                setExportShapes((current) =>
                                  event.target.checked
                                    ? [...current, size]
                                    : current.filter((shape) => shape !== size),
                                )
                              }
                            />
                            <Icon aria-hidden="true" className="size-4" />
                            {IDEA_SHAPE_LABELS[size]}
                          </label>
                        );
                      },
                    )}
                  </div>
                </fieldset>
                <Accordion type="single" collapsible>
                  <AccordionItem value="destination">
                    <AccordionTrigger appearance="compact">
                      Override destination (optional)
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        <Alert role="status">
                          <Info aria-hidden="true" />
                          <AlertDescription>
                            {targets.data?.targets.length
                              ? "Use one booking target for every ad in this batch."
                              : "No booking targets yet. Ads use home pages and the brand website."}{" "}
                            <Link
                              href={`/app/performance/clients/${brandSlug}/wanderos#booking-targets`}
                              onClick={() => setOpen(false)}
                              className="underline underline-offset-4"
                            >
                              Manage booking targets
                            </Link>
                          </AlertDescription>
                        </Alert>
                        {Boolean(targets.data?.targets.length) && (
                          <>
                            <Label htmlFor="batch-booking-target">
                              Booking target
                            </Label>
                            <select
                              id="batch-booking-target"
                              value={bookingTargetId}
                              disabled={pending || targets.isPending}
                              onChange={(event) =>
                                setBookingTargetId(event.target.value)
                              }
                              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                            >
                              <option value="">
                                Home pages and brand website
                              </option>
                              {targets.data?.targets.map((target) => (
                                <option
                                  key={target.id}
                                  value={target.id}
                                  disabled={!target.url}
                                >
                                  {target.name}
                                  {target.issue ? " (needs attention)" : ""}
                                </option>
                              ))}
                            </select>
                          </>
                        )}
                        {targets.isError && (
                          <p role="alert" className="text-xs">
                            Could not load booking targets.{" "}
                            <Button
                              variant="link"
                              onClick={() => void targets.refetch()}
                            >
                              Try again
                            </Button>
                          </p>
                        )}
                        {chosenTarget?.url && (
                          <a
                            href={chosenTarget.url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs break-all underline"
                          >
                            {chosenTarget.url}
                          </a>
                        )}
                        {chosenTarget?.issue && (
                          <p role="alert" className="text-xs">
                            {chosenTarget.issue}
                          </p>
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={ai}
                    disabled={pending}
                    onChange={(event) => setAi(event.target.checked)}
                  />
                  Write copy, choose photos and compose with AI
                </label>
              </>
            )}
          </div>
        </SimpleDialog>
      ) : (
        <ButtonLink
          size="sm"
          variant="outline"
          href={`/app/performance/clients/${brandSlug}/wanderos`}
        >
          Connect WanderOS
        </ButtonLink>
      )}
    </>
  );
  return batchAction;
}

/** A failed or missing preview remains a useful placeholder. */
function GroupPreviewPhoto({ url }: { url: string | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <div className="flex min-w-0 flex-1 items-center justify-center border-r border-background last:border-r-0">
      {url && failedUrl !== url ? (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(url)}
          className="h-full w-full object-cover"
        />
      ) : (
        <House aria-hidden="true" className="size-6 text-muted-foreground" />
      )}
    </div>
  );
}
