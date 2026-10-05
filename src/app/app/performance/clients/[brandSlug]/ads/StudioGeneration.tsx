"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SimpleDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import Link from "next/link";
import { Check, House } from "lucide-react";
import { WorkspaceCard } from "../../../WorkspaceCard";
import { EmptyState } from "@/components/ui/empty-state";
import { useWorkspaceMutation } from "../useWorkspaceMutation";

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
  const router = useRouter();
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
  const [ai, setAi] = useState(false);
  const [batchId, setBatchId] = useState("");
  const [stories, setStories] = useState(true);
  const groups = useQuery({
    ...orpc.homeGroups.context.queryOptions({ input: { brandId } }),
    enabled: open && connected,
  });
  const selected = groups.data?.groups.find((group) => group.id === groupId);
  const homes = useQuery({
    ...orpc.ads.starterIdeaHomes.queryOptions({ input: { brandId, groupId } }),
    enabled: open && connected && Boolean(selected),
  });
  const available = homes.data ?? [];
  const progress = useQuery({
    ...orpc.ads.starterGenerationStatus.queryOptions({ input: { brandId } }),
    refetchInterval: (query) =>
      ["queued", "processing"].includes(query.state.data?.status ?? "")
        ? 2000
        : false,
  });
  const seen = useRef("");
  useEffect(() => {
    const run = progress.data;
    if (!run) return;
    const version = `${run.id}:${run.created}:${run.status}`;
    if (seen.current === version) return;
    seen.current = version;
    router.refresh();
  }, [progress.data, router]);
  const running = ["queued", "processing"].includes(
    progress.data?.status ?? "",
  );
  const generate = useMutation(
    orpc.ads.generateStarterIdeas.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        void progress.refetch();
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
  return (
    <WorkspaceCard
      title="Create a batch from a home group"
      icon={House}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          {manage}
          {connected && (
            <Link
              href={`/app/performance/clients/${brandSlug}/catalog`}
              className="text-sm underline underline-offset-4"
            >
              Open Catalog
            </Link>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Choose a WanderOS home group to create editable ads. Group membership
          is captured when you create the batch; later group changes leave
          existing ads as they are.
        </p>
        <div className="flex flex-wrap gap-2">
          {connected ? (
            <SimpleDialog
              open={open}
              onOpenChange={(next) => {
                if (!pending) {
                  if (next) {
                    setBatchId(crypto.randomUUID());
                    setGroupFilter("");
                  }
                  setOpen(next);
                }
              }}
              title="Create ads from a home group"
              size="lg"
              scrollable
              className="flex max-h-[90dvh] flex-col"
              trigger={
                <Button size="sm" disabled={running}>
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
                        intendedPlacements: [
                          "facebook-feed",
                          "instagram-feed",
                          ...(stories
                            ? (["facebook-story", "instagram-story"] as const)
                            : []),
                        ],
                      });
                    else
                      starter.mutate({
                        brandId,
                        batchId,
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
                    <Button
                      variant="link"
                      onClick={() => void groups.refetch()}
                    >
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
                      <legend className="text-sm font-medium">
                        Home group
                      </legend>
                      <Input
                        aria-label="Filter home groups"
                        placeholder="Filter home groups…"
                        value={groupFilter}
                        onChange={(event) => setGroupFilter(event.target.value)}
                      />
                      <div className="grid max-h-72 grid-cols-1 gap-3 overflow-y-auto p-1 sm:grid-cols-2">
                        {groups.data.groups
                          .filter((group) =>
                            group.name
                              .toLowerCase()
                              .includes(groupFilter.trim().toLowerCase()),
                          )
                          .map((group) => {
                            const disabled =
                              !group.homeIds.length ||
                              group.homeIds.length > 10;
                            const previews = group.homeIds
                              .map(
                                (id) =>
                                  groups.data.homes.find(
                                    (home) => home.id === id,
                                  )?.heroSourceUrl,
                              )
                              .filter((url): url is string => Boolean(url))
                              .slice(0, 3);
                            return (
                              <label
                                key={group.id}
                                className={`relative min-w-0 overflow-hidden rounded-lg border bg-background transition-colors focus-within:ring-2 focus-within:ring-ring ${group.id === groupId ? "border-primary ring-1 ring-primary" : "border-border"} ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-primary"}`}
                              >
                                <input
                                  type="radio"
                                  name="studio-home-group"
                                  value={group.id}
                                  checked={group.id === groupId}
                                  disabled={disabled}
                                  onChange={() => setGroupId(group.id)}
                                  className="sr-only"
                                />
                                <div
                                  aria-hidden="true"
                                  className="flex h-24 overflow-hidden bg-muted"
                                >
                                  {(previews.length ? previews : [null]).map(
                                    (url, index) => (
                                      <GroupPreviewPhoto
                                        key={`${group.id}-${index}`}
                                        url={url}
                                      />
                                    ),
                                  )}
                                </div>
                                <div className="space-y-1 p-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="min-w-0 text-sm font-medium break-words">
                                      {group.name}
                                    </span>
                                    {group.id === groupId && (
                                      <Check
                                        aria-hidden="true"
                                        className="size-4 shrink-0 text-primary"
                                      />
                                    )}
                                  </div>
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
                                  {!previews.some(Boolean) && (
                                    <p className="text-xs text-muted-foreground">
                                      No preview photos
                                    </p>
                                  )}
                                  {group.id === groupId && (
                                    <span className="text-xs font-medium text-primary">
                                      Selected
                                    </span>
                                  )}
                                </div>
                              </label>
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
                        </p>
                      )}
                      {selected && (
                        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <p role="status">
                            Selected: {selected.name} ·{" "}
                            {selected.homeIds.length} homes
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setGroupId("")}
                          >
                            Clear selection
                          </Button>
                        </div>
                      )}
                      {manage}
                    </fieldset>
                    <div className="space-y-2">
                      <Label htmlFor="batch-booking-target">
                        Booking destination
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
                        <option value="">Home pages and brand website</option>
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
                      <p className="text-xs text-muted-foreground">
                        A selected target applies to every ad in this batch. Its
                        current URL is saved with the ads; later target changes
                        leave their destinations unchanged.
                      </p>
                      <Link
                        href={`/app/performance/clients/${brandSlug}/wanderos`}
                        className="text-xs underline"
                      >
                        Manage groups and booking targets in WanderOS
                      </Link>
                    </div>
                    {selected &&
                      (homes.isPending ? (
                        <p role="status">Loading group photos…</p>
                      ) : homes.isError ? (
                        <p role="alert">
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
                          <ul className="max-h-48 divide-y overflow-y-auto rounded-md border">
                            {available.map((home) => (
                              <li
                                key={home.id}
                                className="space-y-2 p-3 text-sm"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium">
                                    {home.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {home.photos.length
                                      ? `${home.photos.length} source photos`
                                      : "Needs a photo in WanderOS"}
                                  </span>
                                </div>
                                <div className="flex h-16 w-48 max-w-full overflow-hidden rounded-md border">
                                  {home.photos.slice(0, 3).map((photo) => (
                                    <GroupPreviewPhoto
                                      key={photo.url}
                                      url={photo.url}
                                    />
                                  ))}
                                </div>
                                <a
                                  href={home.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block text-xs break-all underline"
                                >
                                  {home.url}
                                </a>
                              </li>
                            ))}
                          </ul>
                          {available.some((home) => !home.photos.length) && (
                            <p role="alert" className="text-sm">
                              Every home in this group needs a source photo.
                              Update the group in WanderOS before creating the
                              batch.
                            </p>
                          )}
                        </>
                      ))}
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={ai}
                        disabled={pending}
                        onChange={(event) => setAi(event.target.checked)}
                      />
                      Write copy, choose photos and compose with AI
                    </label>
                    <p className="text-sm text-muted-foreground">
                      {ai
                        ? "Generates fresh drafts with AI copy and editable compositions using real home photos."
                        : "Creates starter layouts from real photos and home names. Write persuasive copy in the shared ad editor afterward."}{" "}
                      One static and one carousel per home, plus a shared hero
                      carousel. Existing ads are preserved.
                    </p>
                    {ai && (
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={stories}
                          disabled={pending}
                          onChange={(event) => setStories(event.target.checked)}
                        />
                        Include Story compositions
                      </label>
                    )}
                  </>
                )}
              </div>
            </SimpleDialog>
          ) : (
            <p className="text-sm text-muted-foreground">
              Connect a WanderOS site and prepare a home group to use this
              workflow. You can create individual ads below.
            </p>
          )}
        </div>
        {progress.data && (running || progress.data.status === "error") && (
          <p
            className="text-sm text-muted-foreground"
            role={progress.data.status === "error" ? "alert" : "status"}
          >
            {progress.data.message} · {progress.data.created}/
            {progress.data.total}
            {progress.data.error ? ` · ${progress.data.error}` : ""}
          </p>
        )}
      </div>
    </WorkspaceCard>
  );
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
