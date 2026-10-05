"use client";
import { CampaignSummary } from "@/components/campaigns/campaign-summary";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Megaphone,
  ImageIcon,
  ArrowUpRight,
  CalendarDays,
  Clock3,
  Circle,
  CircleCheck,
  CirclePause,
  Archive,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WorkPreview, previewDate } from "./WorkPreview";
import { StatusBoard, workLane } from "./StatusBoard";
import { EditorialPreview } from "./EditorialPreview";
import { AdPreview } from "./AdPreview";
import { InitiativeActions, CampaignPlanPreview } from "./InitiativeActions";
import { CampaignShellEditor } from "./CampaignShellEditor";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { orpc } from "@/orpc/client";
import { initiativeStatusSchema } from "@/lib/initiative";
import { MomentAmplifiers } from "../campaigns/[campaignId]/MomentAmplifiers";
import type { InitiativeSave } from "@/server/services/initiative.service";
const empty: InitiativeSave = {
  name: "",
  description: null,
  status: "planned",
  leadBrandId: null,
  ownerId: null,
  startAt: null,
  endAt: null,
};
const initiativeStatusIcons: Record<string, LucideIcon> = {
  planned: CalendarDays,
  active: Megaphone,
  paused: CirclePause,
  completed: CircleCheck,
  archived: Archive,
};
const initiativeDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
function InitiativeEditor({
  initial,
  close,
}: {
  initial?: InitiativeSave;
  close: () => void;
}) {
  const [value, setValue] = useState<InitiativeSave>(initial ?? empty);
  const router = useRouter();
  const client = useQueryClient();
  const { data } = useQuery(
    orpc.initiative.options.queryOptions({ input: {} }),
  );
  const save = useMutation(
    orpc.initiative.save.mutationOptions({
      onSuccess: async (result) => {
        await client.invalidateQueries({ queryKey: orpc.initiative.key() });
        close();
        router.push(`/app/initiatives/${result.initiative.id}`);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(value);
      }}
    >
      <label className="block space-y-1 text-sm">
        Name
        <Input
          required
          maxLength={200}
          value={value.name}
          onChange={(e) => setValue({ ...value, name: e.target.value })}
        />
      </label>
      <label className="block space-y-1 text-sm">
        Brief
        <Textarea
          maxLength={10000}
          value={value.description ?? ""}
          onChange={(e) =>
            setValue({ ...value, description: e.target.value || null })
          }
        />
      </label>
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        <label className="space-y-1 text-sm">
          Status
          <SimpleSelect
            value={value.status}
            onValueChange={(v) =>
              setValue({ ...value, status: initiativeStatusSchema.parse(v) })
            }
            options={initiativeStatusSchema.options.map((s) => ({
              value: s,
              label: s,
            }))}
          />
        </label>
        <label className="space-y-1 text-sm">
          Primary brand
          <SimpleSelect
            value={value.leadBrandId ?? "none"}
            onValueChange={(v) =>
              setValue({ ...value, leadBrandId: v === "none" ? null : v })
            }
            options={[
              { value: "none", label: "Workspace initiative" },
              ...(data?.brands ?? []).map((b) => ({
                value: b.id,
                label: b.name,
              })),
            ]}
          />
        </label>
        <label className="space-y-1 text-sm">
          Owner
          <SimpleSelect
            value={value.ownerId ?? "none"}
            onValueChange={(v) =>
              setValue({ ...value, ownerId: v === "none" ? null : v })
            }
            options={[
              { value: "none", label: "Unassigned" },
              ...(data?.owners ?? []).map((o) => ({
                value: o.id,
                label: o.name ?? "Unnamed teammate",
              })),
            ]}
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        {(["startAt", "endAt"] as const).map((key) => (
          <label key={key} className="space-y-1 text-sm">
            {key === "startAt" ? "Start date" : "End date"}
            <Input
              type="date"
              value={value[key]?.slice(0, 10) ?? ""}
              onChange={(e) =>
                setValue({
                  ...value,
                  [key]: e.target.value
                    ? `${e.target.value}T00:00:00.000Z`
                    : null,
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={close}>
          Cancel
        </Button>
        <Button disabled={save.isPending}>
          {save.isPending ? "Saving…" : "Save initiative"}
        </Button>
      </div>
    </form>
  );
}
export function InitiativesClient() {
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading } = useQuery(
    orpc.initiative.list.queryOptions({ input: {} }),
  );
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Initiatives</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Coordinate content and paid campaigns across brands around one push.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>New initiative</Button>
      </div>
      {error && <p role="alert">{error.message}</p>}
      {isLoading && <p>Loading initiatives…</p>}
      {data?.initiatives.length === 0 && (
        <p className="text-muted-foreground">
          Create an initiative, then link existing series, content posts, and
          campaigns.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
        {data?.initiatives.map((i) => {
          const StatusIcon = initiativeStatusIcons[i.status] ?? Circle;
          const scheduled = Boolean(i.startAt || i.endAt);
          const dates =
            i.startAt && i.endAt && i.startAt !== i.endAt
              ? `${initiativeDate(i.startAt)} – ${initiativeDate(i.endAt)}`
              : i.startAt
                ? `Starts ${initiativeDate(i.startAt)}`
                : i.endAt
                  ? `Ends ${initiativeDate(i.endAt)}`
                  : `Updated ${initiativeDate(i.updatedAt)}`;
          return (
            <Link
              key={i.id}
              href={`/app/initiatives/${i.id}`}
              className="group flex min-w-0 flex-col rounded-2xl border bg-card p-5 transition-colors hover:border-foreground/25 hover:bg-accent/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border bg-muted/50 text-muted-foreground">
                  <Megaphone className="size-4" aria-hidden="true" />
                </span>
                <Badge
                  variant={i.status === "active" ? "secondary" : "outline"}
                  className="capitalize"
                >
                  <StatusIcon aria-hidden="true" />
                  {i.status}
                </Badge>
              </div>
              <h2
                className="line-clamp-2 text-lg leading-snug font-semibold [overflow-wrap:anywhere]"
                title={i.name}
              >
                {i.name}
              </h2>
              <p className="mt-2 mb-5 line-clamp-3 text-sm leading-relaxed [overflow-wrap:anywhere] text-muted-foreground">
                {i.description ||
                  "Add a shared brief to bring the content and campaigns together."}
              </p>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                  {scheduled ? (
                    <CalendarDays
                      className="size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                  ) : (
                    <Clock3 className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  {dates}
                </span>
                <span className="inline-flex items-center gap-1 font-medium">
                  View initiative
                  <ArrowUpRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none"
                    aria-hidden="true"
                  />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="@container">
          <DialogHeader>
            <DialogTitle>New initiative</DialogTitle>
            <DialogDescription>
              Give the push a shared brief. Link work after creating it.
            </DialogDescription>
          </DialogHeader>
          <InitiativeEditor close={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function InitiativeDetail({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [linking, setLinking] = useState(false);
  const [kind, setKind] = useState("contentPostId");
  const [picked, setPicked] = useState("");
  const client = useQueryClient();
  const { data, error, isLoading } = useQuery(
    orpc.initiative.get.queryOptions({ input: { id } }),
  );
  const { data: options } = useQuery({
    ...orpc.initiative.options.queryOptions({ input: {} }),
    enabled: linking,
  });
  useEffect(() => {
    const refresh = () => {
      void client.invalidateQueries({ queryKey: orpc.initiative.key() });
    };
    window.addEventListener("growth:write", refresh);
    return () => window.removeEventListener("growth:write", refresh);
  }, [client]);
  const invalidate = () =>
    client.invalidateQueries({ queryKey: orpc.initiative.key() });
  const unlink = useMutation(
    orpc.initiative.unlink.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );
  const link = useMutation(
    orpc.initiative.link.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setLinking(false);
        setPicked("");
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  if (error) return <p role="alert">{error.message}</p>;
  if (isLoading || !data) return <p>Loading initiative…</p>;
  const i = data.initiative;
  const scope = { initiativeId: id, brandId: i.leadBrandId ?? undefined };
  const brandName = (brandId: string) =>
    data.brands.find((b) => b.id === brandId)?.name ?? "Brand";
  const targets =
    kind === "seriesId"
      ? options?.series.map((s) => ({
          value: s.id,
          label: `${brandName(s.brandId)}: ${s.name}`,
        }))
      : kind === "campaignId"
        ? options?.campaigns.map((c) => ({
            value: c.id,
            label: `${brandName(c.brandId)}: ${c.name}`,
          }))
        : options?.posts.map((p) => ({
            value: p.id,
            label: `${brandName(p.brandId)}: ${p.title ?? "Untitled"}`,
          }));
  const target = (key: string, targetId: string) =>
    key === "seriesId"
      ? { seriesId: targetId }
      : key === "campaignId"
        ? { campaignId: targetId }
        : { contentPostId: targetId };
  const initial: InitiativeSave = {
    ...i,
    status: initiativeStatusSchema.parse(i.status),
  };
  const linkedSeries = new Set(data.series.map((series) => series.id));
  const standalone = data.contentPosts.filter(
    (post) => !post.seriesId || !linkedSeries.has(post.seriesId),
  );
  const socialPosts = (posts: typeof data.contentPosts) =>
    posts.filter((post) => {
      const channels =
        data.previews.posts.find((preview) => preview.id === post.id)
          ?.channels ?? [];
      return (
        channels.length > 0 ||
        !data.previews.editorial.some((item) => item.contentPostId === post.id)
      );
    });
  const standaloneSocial = socialPosts(standalone);
  const postBoard = (posts: typeof data.contentPosts) => (
    <StatusBoard
      items={socialPosts(posts).map((post) => {
        const preview = data.previews.posts.find((item) => item.id === post.id);
        const live =
          preview?.channels.filter((channel) => channel.status === "published")
            .length ?? 0;
        const scheduled =
          preview?.channels.filter((channel) => channel.status === "scheduled")
            .length ?? 0;
        return {
          id: post.id,
          lane: live
            ? workLane("published")
            : scheduled
              ? workLane("scheduled")
              : workLane(post.status),
          card: (
            <WorkPreview
              board
              contentPostId={post.id}
              title={post.title ?? "Untitled"}
              href={`/app/content/${post.id}`}
              brand={brandName(post.brandId)}
              status={post.status}
              delivery={
                live
                  ? `${live} live${scheduled ? ` · ${scheduled} scheduled` : ""}`
                  : scheduled
                    ? `${scheduled} scheduled`
                    : undefined
              }
              description={preview?.description}
              media={preview?.media}
              platforms={preview?.channels.map((channel) => channel.platform)}
              detail={`${preview?.channels.length ?? 0} channel version${preview?.channels.length === 1 ? "" : "s"}`}
              date={previewDate(preview?.plannedAt ?? null)}
              onUnlink={
                post.direct
                  ? () => unlink.mutate({ id, contentPostId: post.id })
                  : undefined
              }
              unlinking={unlink.isPending}
            />
          ),
        };
      })}
    />
  );
  return (
    <div className="space-y-8">
      <Link href="/app/initiatives" className="text-sm text-muted-foreground">
        ← Initiatives
      </Link>
      <section className="space-y-4">
        <div className="flex flex-col justify-between gap-4 @3xl:flex-row @3xl:items-start">
          <div className="min-w-0">
            <p className="mb-2 text-xs text-muted-foreground">Overview</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{i.name}</h1>
              <span className="rounded-full border px-3 py-1 text-xs capitalize">
                {i.status}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm whitespace-pre-line text-muted-foreground">
              {i.description}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button onClick={() => setLinking(true)}>Link work</Button>
            <InitiativeActions
              scope={scope}
              section="overview"
              create={false}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-xs text-muted-foreground">
          {i.leadBrandId && (
            <p>
              Primary brand{" "}
              <span className="ml-2 text-foreground">
                {brandName(i.leadBrandId)}
              </span>
            </p>
          )}
          {i.ownerId && (
            <p>
              Owner{" "}
              <span className="ml-2 text-foreground">
                {data.owners.find((owner) => owner.id === i.ownerId)?.name ??
                  "Unassigned"}
              </span>
            </p>
          )}
          {(i.startAt || i.endAt) && (
            <p>
              Dates{" "}
              <span className="ml-2 text-foreground">
                {previewDate(i.startAt, i.endAt)}
              </span>
            </p>
          )}
        </div>
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Campaigns{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {data.campaigns.length}
            </span>
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setCreatingCampaign(true)}
            >
              Create campaign
            </Button>
            <InitiativeActions
              scope={scope}
              section="campaigns"
              create={false}
            />
          </div>
        </div>
        {data.campaigns.length === 0 && (
          <EmptyState
            compact
            icon={Megaphone}
            title="Give this initiative its first campaign"
            description="Start with a brief, then bring together the ads, audience and platform plans."
            actions={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCreatingCampaign(true)}
              >
                Create campaign
              </Button>
            }
          />
        )}
        {data.campaigns.map((campaign) => {
          const preview = data.previews.campaigns.find(
            (item) => item.id === campaign.id,
          );
          const slug = data.brands.find(
            (brand) => brand.id === campaign.brandId,
          )?.slug;
          const href = slug
            ? `/app/brands/${slug}/ads/${campaign.id}`
            : `/app/campaigns/${campaign.id}`;
          const isLive =
            preview?.ads.some((ad) =>
              ad.executions.some((execution) =>
                ["active", "live"].includes(execution.status.toLowerCase()),
              ),
            ) ?? false;
          return (
            <article
              key={campaign.id}
              className="space-y-4 rounded-xl border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <CampaignSummary
                  name={campaign.name}
                  href={href}
                  status={isLive ? "Live" : "Not live"}
                  detail={`${brandName(campaign.brandId)} · ${campaign.status} · ${preview?.adCount ?? 0} ads · ${preview?.audienceCount ?? 0} audience ${preview?.audienceCount === 1 ? "plan" : "plans"}`}
                  description={preview?.description}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={unlink.isPending}
                  onClick={() => unlink.mutate({ id, campaignId: campaign.id })}
                >
                  Unlink
                </Button>
              </div>
              {(preview?.ads.length ?? 0) === 0 && (
                <EmptyState
                  compact
                  icon={ImageIcon}
                  title="Ready for the first ad"
                  description="Open the campaign to add existing ads or create something for this initiative."
                  actions={
                    <Button size="sm" variant="outline" asChild>
                      <Link href={href}>Open campaign</Link>
                    </Button>
                  }
                />
              )}
              <StatusBoard
                paid
                items={(preview?.ads ?? []).map((ad) => {
                  const statuses = ad.executions.map((execution) =>
                    execution.status.toLowerCase(),
                  );
                  return {
                    id: ad.id,
                    lane: statuses.some((status) =>
                      ["active", "live"].includes(status),
                    )
                      ? workLane("live")
                      : statuses.includes("scheduled")
                        ? workLane("scheduled")
                        : workLane(ad.status),
                    card: (
                      <AdPreview
                        title={ad.name}
                        status={
                          statuses.some((status) =>
                            ["active", "live"].includes(status),
                          )
                            ? "Live"
                            : statuses.includes("scheduled")
                              ? "Scheduled"
                              : ad.status === "drawn"
                                ? "Draft"
                                : ad.status === "kept"
                                  ? "Shortlisted"
                                  : ad.status.replaceAll("_", " ")
                        }
                        href={href}
                        description={ad.description}
                        media={ad.media}
                      />
                    ),
                  };
                })}
              />
              <CampaignPlanPreview
                audiences={preview?.audiences ?? []}
                platforms={preview?.platforms ?? []}
              />
            </article>
          );
        })}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Series{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {data.series.length}
            </span>
          </h2>
          <InitiativeActions scope={scope} section="series" />
        </div>
        {data.series.length === 0 && (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No series linked. You can coordinate standalone social posts below,
            or link a series to include its current and future posts.
          </p>
        )}
        {data.series.map((series) => {
          const preview = data.previews.series.find(
            (item) => item.id === series.id,
          );
          const posts = data.contentPosts.filter(
            (post) => post.seriesId === series.id,
          );
          return (
            <details
              key={series.id}
              open={data.series.length === 1}
              className="rounded-xl border p-4"
            >
              <summary className="cursor-pointer text-sm font-semibold">
                {series.name}{" "}
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {brandName(series.brandId)} · {posts.length} posts
                </span>
              </summary>
              <div className="mt-4 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="max-w-3xl text-xs text-muted-foreground">
                    {preview?.description}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/app/series/${series.id}`}>Open series</Link>
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => unlink.mutate({ id, seriesId: series.id })}
                      disabled={unlink.isPending}
                    >
                      Unlink series
                    </Button>
                  </div>
                </div>
                {postBoard(posts)}
                <p className="text-xs text-muted-foreground">
                  New posts in this series appear here automatically.
                </p>
              </div>
            </details>
          );
        })}
      </section>
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Standalone social posts{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {standaloneSocial.length}
            </span>
          </h2>
          <InitiativeActions scope={scope} section="social" />
        </div>
        <p className="text-xs text-muted-foreground">
          Linked directly to this initiative, outside the series shown above.
        </p>
        {standaloneSocial.length ? (
          postBoard(standaloneSocial)
        ) : (
          <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
            No standalone posts. Link individual social posts, or open a linked
            series to see its posts.
          </p>
        )}
      </section>
      <section className="@container space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Email &amp; blog{" "}
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {data.previews.editorial.length}
            </span>
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Email and blog versions from linked content posts and series.
        </p>
        <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
          {data.previews.editorial.map((item) => (
            <EditorialPreview
              key={item.id}
              item={item}
              seriesName={
                data.series.find((series) => series.id === item.seriesId)?.name
              }
            />
          ))}
          {!data.previews.editorial.some((item) => item.kind === "email") && (
            <EditorialPreview
              kind="email"
              actions={<InitiativeActions scope={scope} section="email" />}
            />
          )}
          {!data.previews.editorial.some((item) => item.kind === "blog") && (
            <EditorialPreview
              kind="blog"
              actions={<InitiativeActions scope={scope} section="blog" />}
            />
          )}
        </div>
      </section>
      <MomentAmplifiers momentId={id} />
      <Dialog open={creatingCampaign} onOpenChange={setCreatingCampaign}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create campaign shell</DialogTitle>
            <DialogDescription>
              Give this campaign a name and brief. Develop its individual pieces
              after saving.
            </DialogDescription>
          </DialogHeader>
          {creatingCampaign && (
            <CampaignShellEditor
              initiativeId={id}
              primaryBrandId={i.leadBrandId}
              brands={data.brands}
              close={() => setCreatingCampaign(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="@container">
          <DialogHeader>
            <DialogTitle>Edit initiative</DialogTitle>
            <DialogDescription>
              Keep the brief and ownership current.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <InitiativeEditor
              initial={initial}
              close={() => setEditing(false)}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={linking} onOpenChange={setLinking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link work</DialogTitle>
            <DialogDescription>
              Link a series to include all its current and future posts.
              Individual posts and campaigns can belong to multiple initiatives.
            </DialogDescription>
          </DialogHeader>
          <SimpleSelect
            value={kind}
            onValueChange={(v) => {
              setKind(v);
              setPicked("");
            }}
            options={[
              { value: "contentPostId", label: "Content post" },
              { value: "seriesId", label: "Series" },
              { value: "campaignId", label: "Paid campaign" },
            ]}
          />
          <SimpleSelect
            value={picked}
            onValueChange={setPicked}
            placeholder="Choose work"
            options={targets ?? []}
          />
          <Button
            disabled={!picked || link.isPending}
            onClick={() => link.mutate({ id, ...target(kind, picked) })}
          >
            {link.isPending ? "Linking…" : "Link"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
