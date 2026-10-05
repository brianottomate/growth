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

/** Batch creation snapshots group membership into the saved ads/run. */
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
  const selectedGroupId = groupId || groups.data?.groups[0]?.id || "";
  const selected = groups.data?.groups.find(
    (group) => group.id === selectedGroupId,
  );
  const [exportShapes, setExportShapes] = useState<IdeaShape[]>([
    "square",
    "story",
  ]);
  const homes = useQuery({
    ...orpc.ads.starterIdeaHomes.queryOptions({
      input: { brandId, groupId: selectedGroupId },
    }),
    enabled: open && connected && Boolean(selected),
  });
  const available = homes.data ?? [];
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
    connected &&
    groups.data?.connected &&
    selected &&
    selected.homeIds.length > 0 &&
    selected.homeIds.length <= 10 &&
    !homes.isPending &&
    !homes.isError &&
    available.length === selected.homeIds.length &&
    available.every((home) => home.photos.length > 0);
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
              }
              setOpen(next);
            }
          }}
          title="Create ads from a home group"
          size="lg"
          scrollable
          className="flex max-h-[90dvh] flex-col"
          trigger={
            <Button size="sm" variant="outline" disabled={running}>
              <House aria-hidden="true" className="size-3.5" />
              From home group
            </Button>
          }
          footer={
            <Button
              size="sm"
              disabled={!ready || running}
              loading={pending}
              onClick={() => {
                const homeIds = available.map((home) => home.id);
                if (ai)
                  generate.mutate({
                    brandId,
                    source: "featured",
                    homeIds,
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
                    bookingTargetId: bookingTargetId || undefined,
                  });
              }}
            >
              {ai ? "Generate ads with AI" : "Create starter ads"}
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
            ) : !groups.data.groups.some(
                (group) =>
                  group.homeIds.length > 0 && group.homeIds.length <= 10,
              ) ? (
              <EmptyState
                compact
                icon={House}
                title="Prepare a home group"
                description="Create a group with 1–10 homes and source photos in WanderOS."
                actions={manage}
              />
            ) : (
              <>
                <fieldset className="min-w-0 space-y-3" disabled={pending}>
                  <legend className="text-sm font-medium">Home group</legend>
                  <Input
                    aria-label="Filter home groups"
                    placeholder="Filter home groups…"
                    value={groupFilter}
                    onChange={(event) => setGroupFilter(event.target.value)}
                  />
                  <div className="space-y-2">
                    {groups.data.groups
                      .filter((group) =>
                        group.name
                          .toLowerCase()
                          .includes(groupFilter.trim().toLowerCase()),
                      )
                      .map((group) => {
                        const disabled =
                          !group.homeIds.length || group.homeIds.length > 10;
                        const active = group.id === selectedGroupId;
                        const preview = group.homeIds
                          .map(
                            (id) =>
                              groups.data.homes.find((home) => home.id === id)
                                ?.heroSourceUrl,
                          )
                          .find(Boolean);
                        return (
                          <div
                            key={group.id}
                            className={`overflow-hidden rounded-lg border ${active ? "border-primary bg-muted/30" : "border-border"}`}
                          >
                            <label
                              className={`flex items-center gap-3 p-3 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                            >
                              <div
                                className="flex h-12 w-16 shrink-0 overflow-hidden rounded-md bg-muted"
                                aria-hidden="true"
                              >
                                <GroupPreviewPhoto url={preview ?? null} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-sm font-medium">
                                  {group.name}
                                </span>
                                <p className="text-xs text-muted-foreground">
                                  {group.homeIds.length}{" "}
                                  {group.homeIds.length === 1
                                    ? "home"
                                    : "homes"}
                                  {disabled
                                    ? group.homeIds.length
                                      ? " · Maximum 10"
                                      : " · Add homes in WanderOS"
                                    : ""}
                                </p>
                              </div>
                              <input
                                type="radio"
                                name="studio-home-group"
                                value={group.id}
                                checked={active}
                                disabled={disabled}
                                onChange={() => setGroupId(group.id)}
                                aria-label={group.name}
                                className="size-4 accent-primary"
                              />
                            </label>
                            {active && (
                              <div className="space-y-3 px-3 pb-3">
                                {homes.isPending ? (
                                  <p role="status" className="text-sm">
                                    Loading home photos…
                                  </p>
                                ) : homes.isError ? (
                                  <p role="alert" className="text-sm">
                                    Could not load home photos.{" "}
                                    <Button
                                      variant="link"
                                      onClick={() => void homes.refetch()}
                                    >
                                      Try again
                                    </Button>
                                  </p>
                                ) : (
                                  <>
                                    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                      {available.map((home) => (
                                        <li
                                          key={home.id}
                                          className="min-w-0 space-y-1"
                                        >
                                          <a
                                            href={home.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            title={`Open listing: ${home.name}`}
                                            className="block space-y-1 rounded-md focus-visible:outline-2 focus-visible:outline-ring"
                                          >
                                            <div className="flex h-20 overflow-hidden rounded-md bg-muted">
                                              <GroupPreviewPhoto
                                                url={
                                                  home.photos[0]?.url ?? null
                                                }
                                              />
                                            </div>
                                            <span className="block truncate text-xs font-medium">
                                              {home.name}
                                            </span>
                                          </a>
                                          <p className="text-xs text-muted-foreground">
                                            {home.photos.length
                                              ? `${home.photos.length} photos`
                                              : "Needs photos"}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                    {available.some(
                                      (home) => !home.photos.length,
                                    ) && (
                                      <p role="alert" className="text-sm">
                                        Every home needs a source photo before
                                        generating.
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                  {!groups.data.groups.some((group) =>
                    group.name
                      .toLowerCase()
                      .includes(groupFilter.trim().toLowerCase()),
                  ) && (
                    <p
                      role="status"
                      className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground"
                    >
                      No home groups match “{groupFilter.trim()}”.{" "}
                      <Button
                        size="sm"
                        variant="link"
                        onClick={() => setGroupFilter("")}
                      >
                        Clear filter
                      </Button>
                      <ButtonLink
                        size="sm"
                        variant="link"
                        href={`/app/performance/clients/${brandSlug}/wanderos#home-groups`}
                        onClick={() => setOpen(false)}
                      >
                        Manage home groups
                      </ButtonLink>
                    </p>
                  )}
                </fieldset>
                {selected && (
                  <div
                    className="rounded-lg border bg-muted/30 p-3 text-sm"
                    role="status"
                  >
                    <p className="font-medium">
                      {selected.homeIds.length * 2 + 1} draft ads
                    </p>
                    <p className="text-muted-foreground">
                      {selected.homeIds.length} static ·{" "}
                      {selected.homeIds.length} home carousels · 1 group
                      carousel
                    </p>
                  </div>
                )}
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
