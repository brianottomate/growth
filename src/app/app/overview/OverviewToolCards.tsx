"use client";

import { ThinkingOrb, type OrbState } from "@/components/thinking-orb";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArchiveRestore,
  ArrowUpRight,
  CalendarClock,
  CircleDot,
  FileText,
  Globe2,
  ImageIcon,
  Layers,
  Loader2,
  Play,
  type LucideIcon,
  Megaphone,
  MessageCircle,
  Radio,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  CREATIVE_IMAGE_MODELS,
  DEFAULT_CREATIVE_IMAGE_MODEL_ID,
  type CreativeImageModelId,
} from "@/lib/creative-image-models";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { SimpleSelect } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import type { WorkContentIntent } from "@/lib/assistant-events";
import { type RouterInputs, type RouterOutputs, useTRPC } from "@/trpc/react";

/**
 * Typed result cards for the /overview assistant's read-only tools.
 *
 * The chat (OverviewChat) renders each `tool-<name>` part through `renderToolPart`,
 * which dispatches to the matching card here. Cards are the growth-domain analogue
 * of Capient's IqToolCards — built for THIS app's capabilities (workspace snapshot,
 * brands, content pipeline, leads, listening) rather than ported wholesale. Any
 * tool without a typed card falls back to <GenericToolCard> (collapsible JSON), so
 * adding a capability never breaks the surface — you just upgrade it when it earns one.
 *
 * Output types mirror the capability handlers in
 * `src/server/ai/capabilities/*`. Dates arrive JSON-serialized (ISO strings).
 */

// ── Output shapes (mirror the server capabilities) ─────────────────────────

type StatusCount = { status: string; count: number };

export interface WorkspaceOverviewOutput {
  brands: number;
  content: { total: number; byStatus: StatusCount[]; needsAttention: number };
  leads: {
    domains: number;
    contacts: number;
    netNew: number;
    inInstantly: number;
  };
  engageWorthyMentions: number;
}

export interface ListBrandsOutput {
  brands: { id: string; name: string; tagline: string | null }[];
}

export interface AudienceTargetsOutput {
  error?: string;
  targets: {
    id: string;
    name: string;
    description: string | null;
    brandName: string | null;
    status: string;
    priority: string;
    profileScope?: string;
    marketSide?: string;
    researchMaturity?: string;
    geography?:
      | { mode: "global"; exclude?: { name: string }[] }
      | {
          mode: "specific";
          include: { name: string }[];
          exclude?: { name: string }[];
        }
      | null;
    demographics?: {
      ageRange?: { min?: number; max?: number };
      languages?: string[];
    } | null;
    intendedChannels: string[] | null;
    coverage: "covered" | "partial" | "gap";
    missingChannels: string[];
    linkedPlatformAudiences: unknown[];
  }[];
  unmappedPlatformAudiences: unknown[];
}

export interface WebSearchOutput {
  error?: string;
  query: string;
  results: {
    title: string;
    url: string;
    highlights: string[];
    publishedDate?: string;
    author?: string;
  }[];
}

export interface ReadWebPageOutput {
  error?: string;
  title?: string;
  url: string;
  text?: string;
  provider?: "exa" | "firecrawl";
  publishedDate?: string;
  author?: string;
}

export interface ContentPipelineOutput {
  total: number;
  byStatus: StatusCount[];
  standaloneTotal: number;
  standaloneByStatus: StatusCount[];
}

export interface ContentStrategyOutput {
  brand: { id: string; name: string };
  pillars: {
    slug: string;
    name: string;
    description: string;
    color: string;
    source: "default" | "custom";
    contentCount: number;
    targetPct: number | null;
    targetPeriod: string | null;
  }[];
  series: {
    id: string;
    name: string;
    description: string | null;
    theme: string | null;
    pillarSlug: string | null;
    status: string;
    startAt: string | null;
    endAt: string | null;
    content: {
      id: string;
      title: string | null;
      pillar: string | null;
      status: string;
    }[];
  }[];
  groupingProposals: {
    id: string;
    confidence: number | null;
    reasoning: string | null;
    proposed: {
      unit?: "single" | "series";
      title?: string;
      theme?: string;
      pillarSlug?: string | null;
      memberPostIds?: string[];
      rationale?: string;
    };
  }[];
  reviewUrl: string;
  pillarsUrl: string;
}

export interface ContentStructureMutationOutput {
  ok?: boolean;
  action?: "saved";
  change?:
    | "pillar"
    | "created"
    | "updated"
    | "organized"
    | "same_idea"
    | "series"
    | "rejected";
  pillar?: { slug: string; name: string };
  series?: { id?: string; name?: string; pillar?: string | null } | null;
  title?: string | null;
  count?: number;
  attachedIdeas?: number;
  contentIdeas?: number;
  channelPosts?: number;
  pillarSlug?: string | null;
  removedFromSeries?: boolean;
  url?: string | null;
  error?: string;
}

export interface MediaSuggestionsOutput {
  content: {
    id: string;
    title: string | null;
    platformDrafts: { id: string; platform: string }[];
  };
  library: {
    mediaAssetId: string;
    kind: string;
    title: string | null;
    alt: string | null;
    tags: string[];
    url: string | null;
    thumbnailUrl: string | null;
    alreadyAttached: boolean;
  }[];
  libraryAssetsWithoutSemanticMetadata: number;
  archive: {
    platformPostId: string;
    platform: string;
    text: string | null;
    publishedAt: string | null;
    media: {
      mediaIndex: number;
      type: string;
      previewAvailable: boolean;
    }[];
  }[];
}

export interface ProductionPacketOutput {
  action: "saved";
  packetId: string;
  title: string;
  purpose: string | null;
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: string | null;
  outputFormat: string | null;
  suggestedTool: string | null;
  instructions: string | null;
  copyText: string;
  contentPostId: string | null;
  brandId: string;
}

/** External handoff is the primary action; direct generation is an optional sibling path. */
export function ProductionPacketCard({
  output,
}: {
  output: ProductionPacketOutput;
}) {
  const trpc = useTRPC();
  const configuration = useQuery(
    trpc.creativeWork.configuration.queryOptions(),
  );
  const latestRun = useQuery(
    trpc.creativeWork.latestRunForPacket.queryOptions({
      packetId: output.packetId,
    }),
  );
  const [modelProfile, setModelProfile] = useState<CreativeImageModelId>(
    DEFAULT_CREATIVE_IMAGE_MODEL_ID,
  );
  const [run, setRun] = useState<
    RouterOutputs["creativeWork"]["submitImage"] | null
  >(null);
  const submitImage = useMutation(
    trpc.creativeWork.submitImage.mutationOptions({
      onSuccess: setRun,
      onError: (error) =>
        toast.error("Image generation could not start", {
          description: error.message,
        }),
    }),
  );
  const refreshRun = useMutation(
    trpc.creativeWork.refreshRun.mutationOptions({
      onSuccess: setRun,
      onError: (error) =>
        toast.error("Could not refresh generation", {
          description: error.message,
        }),
    }),
  );
  const acceptCandidate = useMutation(
    trpc.creativeWork.acceptCandidate.mutationOptions({
      onSuccess: ({ run: accepted }) => {
        setRun(accepted);
        toast.success("Saved to the brand library");
      },
      onError: (error) =>
        toast.error("Could not save image", { description: error.message }),
    }),
  );

  const activeRun = run ?? latestRun.data ?? null;
  const canStartNewRun =
    !activeRun || ["error", "cancelled"].includes(activeRun.status);
  const selectedModelConfigured =
    modelProfile === "google"
      ? configuration.data?.googleConfigured
      : configuration.data?.falConfigured;

  useEffect(() => {
    if (!activeRun || !["queued", "processing"].includes(activeRun.status))
      return;
    const timer = window.setTimeout(
      () => refreshRun.mutate({ runId: activeRun.id }),
      3000,
    );
    return () => window.clearTimeout(timer);
  }, [activeRun, refreshRun]);

  const candidate = activeRun?.candidates[0];
  return (
    <ToolCard
      icon={FileText}
      title="Production packet"
      hint={output.suggestedTool ?? "Ready to hand off"}
    >
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">{output.title}</p>
          {output.purpose && (
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              {output.purpose}
            </p>
          )}
        </div>
        <div className="bg-muted/40 max-h-40 overflow-y-auto rounded-md border p-2.5 text-xs whitespace-pre-wrap">
          {output.prompt}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CopyButton text={output.copyText} label="Copy production packet" />
          <SimpleSelect
            aria-label="Image model"
            size="sm"
            value={modelProfile}
            disabled={!canStartNewRun || submitImage.isPending}
            options={CREATIVE_IMAGE_MODELS.map((model) => ({
              value: model.id,
              label: model.label,
            }))}
            onValueChange={(value) =>
              setModelProfile(value as CreativeImageModelId)
            }
          />
          <Button
            size="sm"
            variant="outline"
            disabled={
              !selectedModelConfigured ||
              submitImage.isPending ||
              !canStartNewRun
            }
            onClick={() =>
              submitImage.mutate({
                packetId: output.packetId,
                modelProfile,
              })
            }
          >
            {submitImage.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5" />
            )}
            Generate image
          </Button>
        </div>
        {canStartNewRun && (
          <p className="text-muted-foreground text-[10px]">
            {
              CREATIVE_IMAGE_MODELS.find((model) => model.id === modelProfile)
                ?.description
            }
          </p>
        )}
        {!configuration.isLoading && !selectedModelConfigured && (
          <p className="text-muted-foreground text-[10px]">
            This model is not configured here. The packet is still ready for
            Claude, ChatGPT, or another production tool.
          </p>
        )}
        {activeRun && ["queued", "processing"].includes(activeRun.status) && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <ThinkingOrb
              state="composing"
              size={20}
              aria-label="Producing a candidate"
            />
            The selected provider is producing one candidate. You can leave this
            session; the run is durable.
          </p>
        )}
        {activeRun?.status === "error" && (
          <p className="text-destructive text-xs">{activeRun.error}</p>
        )}
        {candidate && (
          <div className="overflow-hidden rounded-lg border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={candidate.url}
              alt="Fal image candidate"
              className="max-h-80 w-full object-cover"
            />
            <div className="flex items-center justify-between gap-2 p-2.5">
              <p className="text-muted-foreground text-[10px]">
                Preview only until accepted
              </p>
              <Button
                size="sm"
                disabled={
                  acceptCandidate.isPending || !!activeRun.acceptedMediaAssetId
                }
                onClick={() =>
                  acceptCandidate.mutate({
                    runId: activeRun.id,
                    candidateIndex: 0,
                  })
                }
              >
                {acceptCandidate.isPending && (
                  <Loader2 className="size-3.5 animate-spin" />
                )}
                {activeRun.acceptedMediaAssetId
                  ? "Saved to library"
                  : "Accept to library"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ToolCard>
  );
}

/** A visual shelf for the real candidates behind the assistant's recommendation. */
export function MediaSuggestionsCard({
  output,
  onPrompt,
}: {
  output: MediaSuggestionsOutput;
  onPrompt: (prompt: string) => void;
}) {
  const library = output.library.slice(0, 3);
  const archive = output.archive
    .flatMap((post) =>
      post.media.slice(0, 1).map((media) => ({ ...post, media })),
    )
    .slice(0, 3);

  return (
    <div className="bg-card overflow-hidden rounded-xl border">
      <div className="flex items-center gap-2 border-b px-3.5 py-2.5">
        <Sparkles className="text-primary size-3.5" />
        <div>
          <p className="text-xs font-semibold">Media candidates</p>
          <p className="text-muted-foreground text-[10px]">
            Library now · archive recovery · generate if needed
          </p>
        </div>
      </div>

      {library.length > 0 && (
        <div className="border-b p-3">
          <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase">
            <ImageIcon className="size-3" /> Ready in library
          </div>
          <div className="grid grid-cols-3 gap-2">
            {library.map((asset) => (
              <div
                key={asset.mediaAssetId}
                className="bg-background overflow-hidden rounded-lg border"
              >
                <div className="bg-muted aspect-[4/3] overflow-hidden">
                  {(asset.thumbnailUrl ?? asset.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={asset.thumbnailUrl ?? asset.url ?? undefined}
                      alt={asset.alt ?? asset.title ?? "Library candidate"}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground grid size-full place-items-center">
                      <ImageIcon className="size-5" />
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-[11px] font-medium">
                    {asset.title ?? asset.alt ?? "Library asset"}
                  </p>
                  <button
                    type="button"
                    disabled={asset.alreadyAttached}
                    onClick={() =>
                      onPrompt(
                        `Attach the library asset “${asset.title ?? asset.alt ?? asset.mediaAssetId}” (${asset.mediaAssetId}) to this content pool.`,
                      )
                    }
                    className="text-primary disabled:text-muted-foreground mt-1 text-[10px] font-medium hover:underline disabled:no-underline"
                  >
                    {asset.alreadyAttached ? "Already attached" : "Use this"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {archive.length > 0 && (
        <div className="p-3">
          <div className="text-muted-foreground mb-2 flex items-center gap-1.5 text-[10px] font-semibold tracking-wide uppercase">
            <ArchiveRestore className="size-3" /> Found in archive
          </div>
          <div className="space-y-2">
            {archive.map((candidate) => (
              <div
                key={`${candidate.platformPostId}-${candidate.media.mediaIndex}`}
                className="bg-background flex items-start gap-2 rounded-lg border p-2"
              >
                <div className="bg-muted text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md">
                  <ArchiveRestore className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium">
                    {candidate.text ?? "Archived post media"}
                  </p>
                  <p className="text-muted-foreground text-[10px]">
                    {candidate.platform} · {candidate.media.type}
                    {candidate.publishedAt
                      ? ` · ${fmtDate(candidate.publishedAt)}`
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onPrompt(
                      `Recover media ${candidate.media.mediaIndex + 1} from the archived ${candidate.platform} post ${candidate.platformPostId} and attach it to this content pool.`,
                    )
                  }
                  className="text-primary shrink-0 text-[10px] font-medium hover:underline"
                >
                  Recover
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {output.libraryAssetsWithoutSemanticMetadata > 0 && (
        <p className="text-muted-foreground border-t px-3 py-2 text-[10px]">
          {output.libraryAssetsWithoutSemanticMetadata} more library asset
          {output.libraryAssetsWithoutSemanticMetadata === 1 ? "" : "s"} need
          analysis before Growth can recommend them confidently.
        </p>
      )}
    </div>
  );
}

export interface UpcomingContentOutput {
  posts: {
    id: string;
    title: string | null;
    brandId: string;
    status: string;
    pillar: string | null;
    plannedAt: string | null;
  }[];
  standalonePlatformPosts: {
    id: string;
    title: string;
    brandId: string;
    platform: string;
    status: string;
    pillar: string | null;
    text: string | null;
    scheduledAt: string | null;
  }[];
}

export interface ProductionQueueOutput {
  brand: { id: string; name: string };
  window: { from: string; through: string };
  items: {
    id: string;
    title: string | null;
    plannedAt: string | null;
    status: string;
    completed: number;
    total: number;
    readyForReview: boolean;
    next: { id: string; label: string; detail: string } | null;
    platforms: string[];
    url: string;
  }[];
}

export interface NextForBrandOutput {
  brand: { id: string; name: string; tagline: string | null };
  horizonDays: number;
  readiness: { readyToPlan: boolean; gaps: string[] };
  production: ProductionQueueOutput;
  recommendation: string;
  contentUrl: string;
  calendarUrl: string;
}

export interface LeadsSummaryOutput {
  domains: number;
  inHubspot: number;
  inInstantly: number;
  ranked: number;
  sendBatch: number;
  withPreviewUrl: number;
  untouched: number;
  contacts: number;
  netNew: number;
  topPms: { pms: string | null; count: number }[];
}

export interface MentionsOutput {
  count: number;
  mentions: {
    id: string;
    title: string | null;
    source: string;
    subreddit: string | null;
    author: string | null;
    url: string | null;
    keyword: string | null;
    relevance: number | null;
    intentTag: string | null;
    suggestedAction: string | null;
    status: string;
    receivedAt: string | null;
  }[];
}

// Ads — mirror src/server/services/ads-analytics.service.ts return shapes.
type AdsBucket = {
  key: string;
  ads: number;
  impressions: number;
  clicks: number;
  engagement: number;
  spend: number;
  ctr: number; // 0..1
};

export interface AdsScopeOutput {
  brand: { id: string; slug: string; name: string };
  window: { fromDate: string; toDate: string };
  account: { id?: string; name?: string };
  totals: {
    ads: number;
    allAds: number;
    impressions: number;
    clicks: number;
    ctr: number; // 0..1
    spend: number;
    engagement: number;
    conversions: number;
  };
  byMonth: {
    month: string;
    ads: number;
    impressions: number;
    clicks: number;
    spend: number;
  }[];
  byObjective: AdsBucket[];
  byDestination: AdsBucket[];
  flags: { hasAuditAds: boolean; hasOsAds: boolean };
}

export interface RankedAd {
  id: string;
  name: string | null;
  campaign: string | null;
  objective: string;
  destination: string;
  status: string | null;
  link: string | null;
  thumbnailUrl: string | null;
  created: string | null;
  impressions: number;
  clicks: number;
  ctr: number; // percent
  engagement: number;
  spend: number;
  conversions: number;
  cpc: number;
  body: string;
}

export interface AdsRankedOutput {
  brand: { id: string; slug: string; name: string };
  window: { fromDate: string; toDate: string };
  filters: {
    objective?: string;
    destination?: string;
    status: string;
    metric: string;
    limit: number;
  };
  matched: number;
  ads: RankedAd[];
}

// ── Shared primitives ──────────────────────────────────────────────────────

/** The dashed "running…" placeholder shown while a tool call is in flight. */
export function ToolCallPending({
  label,
  state = "working",
}: {
  label: string;
  /** Reads scan, writes orbit, authoring composes. See capabilityOrbState. */
  state?: OrbState;
}) {
  return (
    <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
      <ThinkingOrb state={state} size={20} aria-label={label} />
      {label}
    </div>
  );
}

/** Card chrome: icon-chip + title header, optional "view" deep-link, body slot. */
function ToolCard({
  icon: Icon,
  title,
  href,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  href?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card text-card-foreground overflow-hidden rounded-lg border">
      <div className="flex items-center justify-between gap-2 border-b px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <span className="bg-primary/10 text-primary grid size-6 shrink-0 place-items-center rounded-md">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium">{title}</span>
          {hint && (
            <span className="text-muted-foreground text-xs">{hint}</span>
          )}
        </div>
        {href && (
          <Link
            href={href}
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5 text-xs"
          >
            View
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="px-3.5 py-3">{children}</div>
    </div>
  );
}

/** A labelled metric tile; whole tile is a deep-link when `href` is set. */
function Stat({
  label,
  value,
  sub,
  subTone = "muted",
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  subTone?: "muted" | "amber" | "emerald";
  href?: string;
}) {
  const body = (
    <>
      <p className="text-muted-foreground text-[11px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{value}</p>
      {sub && (
        <p
          className={cn(
            "mt-0.5 text-xs",
            subTone === "amber" && "text-amber-600 dark:text-amber-400",
            subTone === "emerald" && "text-emerald-600 dark:text-emerald-400",
            subTone === "muted" && "text-muted-foreground",
          )}
        >
          {sub}
        </p>
      )}
    </>
  );
  const className = cn(
    "rounded-lg border px-3 py-2.5",
    href && "hover:border-foreground/20 hover:bg-muted/40 transition-colors",
  );
  return href ? (
    <Link href={href} className={cn(className, "block")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

// ── Content-status presentation ────────────────────────────────────────────

const STATUS_META: Record<
  string,
  { label: string; dot: string; badge: string }
> = {
  slot: {
    label: "Slot",
    dot: "bg-muted-foreground/40",
    badge: "bg-muted text-muted-foreground",
  },
  draft: {
    label: "Draft",
    dot: "bg-amber-400",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  discovered: {
    label: "Discovered",
    dot: "bg-violet-400",
    badge: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  pending_review: {
    label: "Needs review",
    dot: "bg-orange-400",
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  },
  approved: {
    label: "Approved",
    dot: "bg-sky-400",
    badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  scheduled: {
    label: "Scheduled",
    dot: "bg-blue-400",
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  published: {
    label: "Published",
    dot: "bg-emerald-400",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    label: "Rejected",
    dot: "bg-red-400",
    badge: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  archived: {
    label: "Archived",
    dot: "bg-muted-foreground/30",
    badge: "bg-muted text-muted-foreground",
  },
};

const statusMeta = (s: string) =>
  STATUS_META[s] ?? {
    label: s.replace(/_/g, " "),
    dot: "bg-muted-foreground/40",
    badge: "bg-muted text-muted-foreground",
  };

const ACTION_META: Record<string, { label: string; badge: string }> = {
  engage: {
    label: "Engage",
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  monitor: {
    label: "Monitor",
    badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  skip: { label: "Skip", badge: "bg-muted text-muted-foreground" },
};

function StatusBadge({ status }: { status: string }) {
  const m = statusMeta(status);
  return (
    <span
      className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium", m.badge)}
    >
      {m.label}
    </span>
  );
}

const fmtDate = (value: string | null): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const fmtNum = (n: number) => n.toLocaleString("en-US");

// ── Cards ────────────────────────────────────────────────────────────────

/** The home snapshot — `workspaceOverview`. Four deep-linked metric tiles. */
export function WorkspaceOverviewCard({
  output,
}: {
  output: WorkspaceOverviewOutput;
}) {
  const { brands, content, leads, engageWorthyMentions } = output;
  return (
    <ToolCard icon={Sparkles} title="Workspace snapshot">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Brands" value={brands} href="/app/brands" />
        <Stat
          label="Content"
          value={fmtNum(content.total)}
          sub={
            content.needsAttention > 0
              ? `${content.needsAttention} need attention`
              : "all triaged"
          }
          subTone={content.needsAttention > 0 ? "amber" : "muted"}
          href="/app/content"
        />
        <Stat
          label="Leads"
          value={fmtNum(leads.domains)}
          sub={`${fmtNum(leads.netNew)} sendable`}
          subTone={leads.netNew > 0 ? "emerald" : "muted"}
          href="/app/leads"
        />
        <Stat
          label="To engage"
          value={engageWorthyMentions}
          sub="social mentions"
          subTone={engageWorthyMentions > 0 ? "emerald" : "muted"}
          href="/app/listen"
        />
      </div>
    </ToolCard>
  );
}

/** `brandRead.list` — name + tagline rows. */
export function BrandsCard({ output }: { output: ListBrandsOutput }) {
  const { brands } = output;
  return (
    <ToolCard
      icon={Layers}
      title="Brands"
      href="/app/brands"
      hint={`${brands.length}`}
    >
      {brands.length === 0 ? (
        <p className="text-muted-foreground text-sm">No brands yet.</p>
      ) : (
        <ul className="divide-y">
          {brands.map((b) => (
            <li
              key={b.id}
              className="flex items-baseline gap-2 py-1.5 first:pt-0 last:pb-0"
            >
              <span className="text-sm font-medium">{b.name}</span>
              {b.tagline && (
                <span className="text-muted-foreground truncate text-xs">
                  {b.tagline}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
}

/** `listAudienceTargets` — strategic targets and paid-channel coverage. */
export function AudienceTargetsCard({
  output,
}: {
  output: AudienceTargetsOutput;
}) {
  const { targets = [], unmappedPlatformAudiences = [] } = output;
  return (
    <ToolCard
      icon={Target}
      title="Audience strategy"
      href="/app/audiences"
      hint={`${targets.length} target${targets.length === 1 ? "" : "s"}`}
    >
      {output.error ? (
        <p className="text-destructive text-sm">{output.error}</p>
      ) : targets.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No strategic audience targets yet.
        </p>
      ) : (
        <ul className="divide-y">
          {targets.map((target) => (
            <li key={target.id} className="py-2 first:pt-0 last:pb-0">
              <div className="flex items-center gap-2">
                <span className="min-w-0 truncate text-sm font-medium">
                  {target.name}
                </span>
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    target.coverage === "covered" &&
                      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                    target.coverage === "partial" &&
                      "bg-amber-500/10 text-amber-600 dark:text-amber-400",
                    target.coverage === "gap" &&
                      "bg-red-500/10 text-red-600 dark:text-red-400",
                  )}
                >
                  {target.coverage}
                </span>
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {[
                  target.brandName,
                  target.profileScope?.replaceAll("_", " "),
                  target.marketSide,
                  target.priority.replaceAll("_", " "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                {target.geography == null
                  ? "Geography not established"
                  : target.geography.mode === "global"
                    ? "Global"
                    : target.geography.include
                        .map((place) => place.name)
                        .join(", ")}
                {target.researchMaturity
                  ? ` · ${target.researchMaturity.replaceAll("_", " ")}`
                  : ""}
              </p>
              {target.description && (
                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                  {target.description}
                </p>
              )}
              {(target.intendedChannels?.length ?? 0) > 0 && (
                <p className="text-muted-foreground mt-1 text-[11px]">
                  Intended: {target.intendedChannels!.join(", ")}
                  {target.missingChannels.length > 0 &&
                    ` · Missing: ${target.missingChannels.join(", ")}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {unmappedPlatformAudiences.length > 0 && (
        <p className="text-muted-foreground mt-2 border-t pt-2 text-xs">
          {unmappedPlatformAudiences.length} platform audience
          {unmappedPlatformAudiences.length === 1 ? " is" : "s are"} not linked
          to a target.
        </p>
      )}
    </ToolCard>
  );
}

/** `webSearch` — Exa results with compact highlights and usable citations. */
export function WebSearchCard({ output }: { output: WebSearchOutput }) {
  const results = output.results ?? [];
  return (
    <ToolCard
      icon={Search}
      title="Web research"
      hint={`${results.length} sources`}
    >
      <p className="mb-2 text-sm font-medium">{output.query}</p>
      {output.error ? (
        <p className="text-destructive text-sm">{output.error}</p>
      ) : results.length === 0 ? (
        <p className="text-muted-foreground text-sm">No sources found.</p>
      ) : (
        <ul className="divide-y">
          {results.map((result) => (
            <li key={result.url} className="py-2 first:pt-0 last:pb-0">
              <a
                href={result.url}
                target="_blank"
                rel="noreferrer"
                className="hover:text-primary flex items-start gap-1 text-sm font-medium"
              >
                <span className="line-clamp-2">{result.title}</span>
                <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
              {(result.author || result.publishedDate) && (
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {[result.author, result.publishedDate?.slice(0, 10)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {result.highlights[0] && (
                <p className="text-muted-foreground mt-1 line-clamp-3 text-xs">
                  {result.highlights[0]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
}

/** `readWebPage` — confirms the specific source the agent inspected. */
export function ReadWebPageCard({ output }: { output: ReadWebPageOutput }) {
  return (
    <ToolCard icon={Globe2} title="Page read" hint={output.provider}>
      {output.error ? (
        <p className="text-destructive text-sm">{output.error}</p>
      ) : (
        <>
          <a
            href={output.url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-primary inline-flex items-start gap-1 text-sm font-medium"
          >
            <span className="line-clamp-2">{output.title ?? output.url}</span>
            <ArrowUpRight className="mt-0.5 h-3 w-3 shrink-0" />
          </a>
          {output.text && (
            <p className="text-muted-foreground mt-1.5 line-clamp-4 text-xs">
              {output.text}
            </p>
          )}
        </>
      )}
    </ToolCard>
  );
}

/** `contentPipelineSummary` — segmented bar + per-status legend. */
export function ContentPipelineCard({
  output,
}: {
  output: ContentPipelineOutput;
}) {
  const { total, byStatus, standaloneTotal = 0 } = output;
  const sorted = [...byStatus].sort((a, b) => b.count - a.count);
  return (
    <ToolCard
      icon={FileText}
      title="Content pipeline"
      href="/app/content"
      hint={`${fmtNum(total)} ideas · ${fmtNum(standaloneTotal)} native drafts`}
    >
      {total === 0 && standaloneTotal === 0 ? (
        <p className="text-muted-foreground text-sm">Pipeline is empty.</p>
      ) : (
        <>
          {total > 0 && (
            <>
              <div className="bg-muted flex h-2 w-full overflow-hidden rounded-full">
                {sorted.map((s) => (
                  <div
                    key={s.status}
                    className={statusMeta(s.status).dot}
                    style={{ width: `${(s.count / total) * 100}%` }}
                    title={`${statusMeta(s.status).label}: ${s.count}`}
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {sorted.map((s) => (
                  <div
                    key={s.status}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        statusMeta(s.status).dot,
                      )}
                    />
                    <span className="text-muted-foreground">
                      {statusMeta(s.status).label}
                    </span>
                    <span className="font-medium tabular-nums">{s.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {standaloneTotal > 0 && (
            <p className="text-muted-foreground mt-3 text-xs">
              {standaloneTotal} platform-first draft
              {standaloneTotal === 1 ? "" : "s"} are still intentionally
              ungrouped.
            </p>
          )}
        </>
      )}
    </ToolCard>
  );
}

/** `getContentStrategy` — the small durable hierarchy the operator can shape
 * conversationally: pillar → series → canonical ideas, plus pending
 * retrospective reconstruction proposals. */
export function ContentStrategyCard({
  output,
}: {
  output: ContentStrategyOutput;
}) {
  return (
    <ToolCard
      icon={Layers}
      title={`Content structure · ${output.brand.name}`}
      href={output.pillarsUrl}
      hint={`${output.pillars.length} pillars · ${output.series.length} series`}
    >
      <div className="space-y-3">
        <div>
          <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wide uppercase">
            Pillars
          </p>
          {output.pillars.length ? (
            <div className="flex flex-wrap gap-1.5">
              {output.pillars.map((pillar) => (
                <span
                  key={pillar.slug}
                  className="bg-muted/50 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]"
                  title={pillar.description}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: pillar.color }}
                  />
                  {pillar.name}
                  <span className="text-muted-foreground tabular-nums">
                    {pillar.contentCount}
                    {pillar.targetPct != null ? ` · ${pillar.targetPct}%` : ""}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-xs">
              No pillars defined yet.
            </p>
          )}
        </div>

        <div className="border-t pt-2.5">
          <p className="text-muted-foreground mb-1.5 text-[10px] font-medium tracking-wide uppercase">
            Series
          </p>
          {output.series.length ? (
            <ul className="space-y-1.5">
              {output.series.slice(0, 6).map((series) => (
                <li key={series.id} className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {series.name}
                  </span>
                  {series.pillarSlug && (
                    <span className="text-muted-foreground max-w-32 truncate">
                      {series.pillarSlug}
                    </span>
                  )}
                  <span className="text-muted-foreground tabular-nums">
                    {series.content.length} idea
                    {series.content.length === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-xs">
              No series defined yet.
            </p>
          )}
        </div>

        {output.groupingProposals.length > 0 && (
          <Link
            href={output.reviewUrl}
            className="flex items-center justify-between rounded-md border border-amber-500/20 bg-amber-500/5 px-2.5 py-2 text-xs text-amber-600 dark:text-amber-400"
          >
            <span>
              {output.groupingProposals.length} grouping proposal
              {output.groupingProposals.length === 1 ? "" : "s"} awaiting review
            </span>
            <ArrowUpRight className="size-3.5" />
          </Link>
        )}
      </div>
    </ToolCard>
  );
}

/** Friendly completion state for pillar/series/grouping writes. */
export function ContentStructureMutationCard({
  output,
}: {
  output: ContentStructureMutationOutput;
}) {
  if (output.error) {
    return <p className="text-destructive text-xs">{output.error}</p>;
  }
  const label =
    output.change === "pillar"
      ? "Pillar saved"
      : output.change === "created"
        ? "Series created"
        : output.change === "updated"
          ? "Series updated"
          : output.change === "same_idea"
            ? "Channel posts grouped as one idea"
            : output.change === "series"
              ? "Series created from existing posts"
              : output.change === "rejected"
                ? "Grouping proposal dismissed"
                : output.removedFromSeries
                  ? "Ideas removed from series"
                  : "Content structure updated";
  const title = output.pillar?.name ?? output.series?.name ?? output.title;
  const affected =
    output.attachedIdeas ??
    output.contentIdeas ??
    output.channelPosts ??
    output.count;
  return (
    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-500">
        <Sparkles className="size-3.5" />
        {label}
      </div>
      {title && <p className="mt-1 text-sm font-medium">{title}</p>}
      {(output.pillarSlug || affected != null) && (
        <p className="text-muted-foreground mt-0.5 text-xs">
          {[
            output.pillarSlug ? `Pillar: ${output.pillarSlug}` : null,
            affected != null
              ? `${affected} ${output.channelPosts != null ? "channel posts" : "ideas"}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {output.url && (
        <Link
          href={output.url}
          className="text-primary mt-2 inline-flex items-center gap-1 text-xs font-medium hover:underline"
        >
          Inspect structure
          <ArrowUpRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

/** `upcomingContent` — soonest-first rows with date chip + status. */
export function UpcomingContentCard({
  output,
}: {
  output: UpcomingContentOutput;
}) {
  const rows = [
    ...output.posts.map((post) => ({
      ...post,
      at: post.plannedAt,
      platform: null as string | null,
    })),
    ...(output.standalonePlatformPosts ?? []).map((post) => ({
      ...post,
      at: post.scheduledAt,
    })),
  ].sort((a, b) => (a.at ?? "").localeCompare(b.at ?? ""));
  return (
    <ToolCard
      icon={CalendarClock}
      title="Coming up"
      href="/app/feed"
      hint={`${rows.length}`}
    >
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing planned ahead.</p>
      ) : (
        <ul className="divide-y">
          {rows.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
            >
              <span className="text-muted-foreground w-12 shrink-0 text-xs tabular-nums">
                {fmtDate(p.at)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {p.title?.trim() || (
                  <span className="text-muted-foreground italic">Untitled</span>
                )}
                {p.pillar && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    · {p.pillar}
                  </span>
                )}
                {p.platform && (
                  <span className="text-muted-foreground ml-1.5 text-xs">
                    · {p.platform}
                  </span>
                )}
              </span>
              <StatusBadge status={p.status} />
            </li>
          ))}
        </ul>
      )}
    </ToolCard>
  );
}

function ProductionQueueRows({
  output,
  onWork,
}: {
  output: ProductionQueueOutput;
  onWork: (intent: WorkContentIntent) => void;
}) {
  const visible = output.items.slice(0, 3);

  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No canonical content items are planned in this window.
      </p>
    );
  }

  return (
    <>
      <ul className="divide-y">
        {visible.map((item) => {
          const title = item.title?.trim() || "Untitled content item";
          return (
            <li key={item.id} className="py-2.5 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span className="text-muted-foreground w-12 shrink-0 pt-0.5 text-xs tabular-nums">
                  {fmtDate(item.plannedAt)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{title}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {item.completed}/{item.total} steps complete
                    {item.next
                      ? ` · Next: ${item.next.detail}`
                      : " · Ready for review"}
                  </p>
                  {item.platforms.length > 0 && (
                    <p className="text-muted-foreground mt-0.5 truncate text-[11px]">
                      {[...new Set(item.platforms)].join(" · ")}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-2">
                <Link
                  href={item.url}
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium"
                >
                  Open
                  <ArrowUpRight className="size-3" />
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    onWork({
                      type: "work_content_post",
                      brandId: output.brand.id,
                      brandName: output.brand.name,
                      contentPostId: item.id,
                      contentTitle: title,
                      visibleText: `Help me work on “${title}”. Start with the next incomplete production step.`,
                    })
                  }
                  className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                >
                  <MessageCircle className="size-3" />
                  Work in chat
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {output.items.length > visible.length && (
        <p className="text-muted-foreground mt-2 border-t pt-2 text-xs">
          {output.items.length - visible.length} more item
          {output.items.length - visible.length === 1 ? "" : "s"} in the
          look-ahead.
        </p>
      )}
    </>
  );
}

/** `productionQueue` — a calm, bounded bridge from planning into execution. */
export function ProductionQueueCard({
  output,
  onWork,
}: {
  output: ProductionQueueOutput;
  onWork: (intent: WorkContentIntent) => void;
}) {
  return (
    <ToolCard
      icon={CircleDot}
      title={`Production queue · ${output.brand.name}`}
      hint={`${output.items.length}`}
    >
      <ProductionQueueRows output={output} onWork={onWork} />
    </ToolCard>
  );
}

/** `nextForBrand` — readiness context plus no more than three priorities. */
export function NextForBrandCard({
  output,
  onWork,
}: {
  output: NextForBrandOutput;
  onWork: (intent: WorkContentIntent) => void;
}) {
  return (
    <ToolCard
      icon={CalendarClock}
      title={`Next · ${output.brand.name}`}
      hint={`${output.horizonDays} days`}
    >
      <p className="text-sm">{output.recommendation}</p>
      {output.readiness.gaps.length > 0 && (
        <p className="text-muted-foreground mt-1.5 text-xs">
          Planning context still needs: {output.readiness.gaps.join(", ")}.
        </p>
      )}
      <div className="mt-3 border-t pt-3">
        <ProductionQueueRows output={output.production} onWork={onWork} />
      </div>
      <div className="mt-3 flex items-center gap-3 border-t pt-2.5 text-xs font-medium">
        <Link href={output.contentUrl} className="text-primary hover:underline">
          Open content
        </Link>
        <Link
          href={output.calendarUrl}
          className="text-primary hover:underline"
        >
          Open calendar
        </Link>
      </div>
    </ToolCard>
  );
}

/** `leadsSummary` — headline tiles + top-PMS mini bars. */
export function LeadsSummaryCard({ output }: { output: LeadsSummaryOutput }) {
  const {
    domains,
    contacts,
    netNew,
    untouched,
    ranked,
    sendBatch,
    inHubspot,
    topPms,
  } = output;
  const pmsMax = Math.max(1, ...topPms.map((p) => p.count));
  return (
    <ToolCard icon={Users} title="Leads pool" href="/app/leads">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Domains" value={fmtNum(domains)} />
        <Stat label="Contacts" value={fmtNum(contacts)} />
        <Stat
          label="Net-new sendable"
          value={fmtNum(netNew)}
          subTone="emerald"
          sub={netNew > 0 ? "ready to send" : undefined}
        />
        <Stat label="Untouched pool" value={fmtNum(untouched)} />
        <Stat label="Ranked" value={fmtNum(ranked)} />
        <Stat label="Send batch" value={fmtNum(sendBatch)} />
        <Stat label="In HubSpot" value={fmtNum(inHubspot)} />
      </div>
      {topPms.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            Top PMS platforms
          </p>
          <div className="space-y-1.5">
            {topPms.map((p) => (
              <div
                key={p.pms ?? "unknown"}
                className="flex items-center gap-2 text-xs"
              >
                <span className="w-24 shrink-0 truncate">
                  {p.pms ?? "Unknown"}
                </span>
                <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-primary/60 h-full rounded-full"
                    style={{ width: `${(p.count / pmsMax) * 100}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right font-medium tabular-nums">
                  {fmtNum(p.count)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolCard>
  );
}

/** `recentMentions` — listening queue rows with source, action, relevance. */
export function MentionsCard({ output }: { output: MentionsOutput }) {
  const { mentions, count } = output;
  return (
    <ToolCard
      icon={Radio}
      title="Social mentions"
      href="/app/listen"
      hint={`${count}`}
    >
      {mentions.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing in the queue.</p>
      ) : (
        <ul className="divide-y">
          {mentions.map((m) => {
            const action = m.suggestedAction
              ? (ACTION_META[m.suggestedAction] ?? {
                  label: m.suggestedAction,
                  badge: "bg-muted text-muted-foreground",
                })
              : null;
            const where = m.subreddit ? `r/${m.subreddit}` : m.source;
            const Row = (
              <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
                <MessageCircle className="text-muted-foreground mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {m.title?.trim() || (
                      <span className="text-muted-foreground italic">
                        No title
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="uppercase">{where}</span>
                    {m.author && <span>· {m.author}</span>}
                    <span>· {fmtDate(m.receivedAt)}</span>
                    {typeof m.relevance === "number" && (
                      <span className="inline-flex items-center gap-0.5">
                        · <CircleDot className="h-2.5 w-2.5" />
                        {m.relevance <= 1
                          ? Math.round(m.relevance * 100)
                          : m.relevance}
                      </span>
                    )}
                  </p>
                </div>
                {action && (
                  <span
                    className={cn(
                      "shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium",
                      action.badge,
                    )}
                  >
                    {action.label}
                  </span>
                )}
              </div>
            );
            return (
              <li key={m.id}>
                {m.url ? (
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:bg-muted/40 -mx-1 block rounded px-1"
                  >
                    {Row}
                  </a>
                ) : (
                  Row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ToolCard>
  );
}

// ── Ads cards ──────────────────────────────────────────────────────────────

const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_SALES: "Sales · consumer",
  OUTCOME_LEADS: "Leads · PM/WanderOS",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_APP_PROMOTION: "App promotion",
  POST_ENGAGEMENT: "Post engagement",
  "(none)": "Uncategorized",
};
const objectiveLabel = (o: string) => OBJECTIVE_LABEL[o] ?? o;

const DESTINATION_LABEL: Record<string, string> = {
  audit: "Audit",
  os: "WanderOS · /os",
  list: "List",
  marketplace: "Marketplace",
  "other-link": "Other link",
  "lead-form": "Lead form · on-Meta",
  engagement: "Engagement",
  unknown: "No link surfaced",
};
const destinationLabel = (d: string) => DESTINATION_LABEL[d] ?? d;

const METRIC_LABEL: Record<string, string> = {
  impressions: "impressions",
  clicks: "clicks",
  ctr: "CTR",
  engagement: "engagement",
  spend: "spend",
};

const fmtUsd = (n: number) =>
  n >= 1000 ? `$${(n / 1000).toFixed(1)}K` : `$${fmtNum(Math.round(n))}`;

const fmtPct = (ratio: number) => `${(ratio * 100).toFixed(2)}%`;

const fmtMonth = (ym: string) => {
  const [y, m] = ym.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(d.getTime())) return ym;
  return d.toLocaleDateString("en-US", { month: "short" }) + ` '${y?.slice(2)}`;
};

const fmtWindow = (w: { fromDate: string; toDate: string }) => {
  const f = new Date(w.fromDate);
  const t = new Date(w.toDate);
  const opt: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };
  return `${f.toLocaleDateString("en-US", opt)} – ${t.toLocaleDateString("en-US", opt)}`;
};

/** label · bar · value/CTR row, reused for objective + destination breakdowns. */
function BreakdownBars({
  rows,
  label,
  max,
}: {
  rows: AdsBucket[];
  label: (key: string) => string;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-2 text-xs">
          <span className="w-32 shrink-0 truncate">{label(r.key)}</span>
          <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-primary/60 h-full rounded-full"
              style={{ width: `${(r.impressions / max) * 100}%` }}
            />
          </div>
          <span className="text-muted-foreground w-28 shrink-0 text-right tabular-nums">
            {fmtNum(r.impressions)} · {fmtPct(r.ctr)}
          </span>
        </div>
      ))}
    </div>
  );
}

/** `adsScope` — totals + destination/objective breakdowns + audit flag. */
export function AdsScopeCard({ output }: { output: AdsScopeOutput }) {
  const { totals, byDestination, byObjective, byMonth, flags, window } = output;
  const destMax = Math.max(1, ...byDestination.map((d) => d.impressions));
  const objMax = Math.max(1, ...byObjective.map((o) => o.impressions));
  const monthMax = Math.max(1, ...byMonth.map((m) => m.impressions));
  return (
    <ToolCard icon={Megaphone} title="Ad performance" hint={fmtWindow(window)}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Impressions" value={fmtNum(totals.impressions)} />
        <Stat
          label="Clicks"
          value={fmtNum(totals.clicks)}
          sub={fmtPct(totals.ctr)}
        />
        <Stat label="Spend" value={fmtUsd(totals.spend)} />
        <Stat
          label="Ads delivered"
          value={fmtNum(totals.ads)}
          sub={`of ${fmtNum(totals.allAds)}`}
        />
      </div>

      {!flags.hasAuditAds && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
          No <span className="font-medium">audit</span>-destination ads ran in
          this window — that angle would be net-new.
        </p>
      )}

      {byDestination.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            By destination · impressions · CTR
          </p>
          <BreakdownBars
            rows={byDestination}
            label={destinationLabel}
            max={destMax}
          />
        </div>
      )}

      {byObjective.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            By objective
          </p>
          <BreakdownBars
            rows={byObjective}
            label={objectiveLabel}
            max={objMax}
          />
        </div>
      )}

      {byMonth.length > 1 && (
        <div className="mt-3 border-t pt-3">
          <p className="text-muted-foreground mb-2 text-[11px] font-medium tracking-wide uppercase">
            Impressions by launch month
          </p>
          <div className="flex items-end gap-1" style={{ height: 40 }}>
            {byMonth.map((m) => (
              <div
                key={m.month}
                className="flex flex-1 flex-col items-center justify-end gap-1"
                title={`${fmtMonth(m.month)}: ${fmtNum(m.impressions)} impr · ${fmtUsd(m.spend)}`}
              >
                <div
                  className="bg-primary/50 w-full rounded-sm"
                  style={{
                    height: `${Math.max(2, (m.impressions / monthMax) * 32)}px`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </ToolCard>
  );
}

const DEST_CHIP =
  "rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground";

/** A single ranked-ad row: thumbnail + name + metrics + truncated copy. */
function RankedAdRow({ ad }: { ad: RankedAd }) {
  const link = ad.link ?? undefined;
  const Name = (
    <span className="truncate text-sm font-medium" title={ad.name ?? undefined}>
      {ad.name ?? "(unnamed ad)"}
    </span>
  );
  return (
    <li className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
      {ad.thumbnailUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.thumbnailUrl}
          alt=""
          className="bg-muted size-12 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="bg-muted grid size-12 shrink-0 place-items-center rounded-md">
          <Megaphone className="text-muted-foreground h-4 w-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {link ? (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="truncate text-sm font-medium hover:underline"
              title={ad.name ?? undefined}
            >
              {ad.name ?? "(unnamed ad)"}
            </a>
          ) : (
            Name
          )}
          <span className={DEST_CHIP}>{destinationLabel(ad.destination)}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] tabular-nums">
          <span>{fmtNum(ad.impressions)} impr</span>
          <span>· {fmtNum(ad.clicks)} clicks</span>
          <span>· {ad.ctr}% CTR</span>
          <span>· {fmtNum(ad.engagement)} eng</span>
          <span>· {fmtUsd(ad.spend)}</span>
          {ad.created && <span>· {ad.created}</span>}
        </p>
        {ad.body && (
          <p className="text-muted-foreground/90 mt-1 line-clamp-2 text-xs italic">
            “{ad.body}”
          </p>
        )}
      </div>
    </li>
  );
}

function rankedDigest(out: AdsRankedOutput): string {
  const lines = [
    `# Wander top ads — ${fmtWindow(out.window)}`,
    `Ranked by ${METRIC_LABEL[out.filters.metric] ?? out.filters.metric}` +
      `${out.filters.objective ? ` · objective ${out.filters.objective}` : ""}` +
      `${out.filters.destination ? ` · destination ${out.filters.destination}` : ""}` +
      ` · ${out.matched} matched`,
    "",
    ...out.ads.map(
      (a, i) =>
        `${i + 1}. [${destinationLabel(a.destination)}] ${a.name ?? "(unnamed)"} — ` +
        `${fmtNum(a.impressions)} impr, ${fmtNum(a.clicks)} clicks, ${a.ctr}% CTR, ${fmtUsd(a.spend)}` +
        `${a.body ? `\n   "${a.body}"` : ""}`,
    ),
  ];
  return lines.join("\n");
}

type TopAdsInput = RouterInputs["ads"]["topAds"];
type Metric = NonNullable<TopAdsInput["metric"]>;
type StatusFilter = NonNullable<TopAdsInput["status"]>;

const METRIC_OPTIONS: Metric[] = [
  "impressions",
  "clicks",
  "ctr",
  "engagement",
  "spend",
];
const STATUS_OPTIONS: StatusFilter[] = ["all", "active", "non-paused"];
const OBJECTIVE_OPTIONS = [
  "OUTCOME_SALES",
  "OUTCOME_LEADS",
  "OUTCOME_AWARENESS",
  "OUTCOME_TRAFFIC",
  "OUTCOME_ENGAGEMENT",
] as const;
const DESTINATION_OPTIONS = Object.keys(DESTINATION_LABEL);

/** Compact native select styled to match the card chrome. */
function MiniSelect({
  value,
  onChange,
  children,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <select
      title={title}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-border bg-background text-foreground h-7 rounded-md border px-1.5 text-[11px]"
    >
      {children}
    </select>
  );
}

/**
 * `topAds` — ranked creative rows with INTERACTIVE controls (Tier 2). First
 * paint is the chat tool's output (seeded as `initialData`); changing a control
 * refetches in place through the `ads` tRPC router — same compute, no LLM
 * round-trip, no new chat messages.
 */
export function AdsRankedCard({ output }: { output: AdsRankedOutput }) {
  const trpc = useTRPC();
  const [metric, setMetric] = useState<Metric>(output.filters.metric as Metric);
  const [status, setStatus] = useState<StatusFilter>(
    output.filters.status as StatusFilter,
  );
  const [objective, setObjective] = useState(output.filters.objective ?? "");
  const [destination, setDestination] = useState(
    output.filters.destination ?? "",
  );

  const input: TopAdsInput = {
    brandSlug: output.brand.slug,
    fromDate: output.window.fromDate,
    toDate: output.window.toDate,
    objective: objective || undefined,
    destination: (destination || undefined) as TopAdsInput["destination"],
    status,
    metric,
    limit: output.filters.limit,
  };

  const { data, isFetching } = useQuery({
    ...trpc.ads.topAds.queryOptions(input),
    initialData: output as RouterOutputs["ads"]["topAds"],
  });

  const view: AdsRankedOutput = data ?? output;
  const { ads, matched, window } = view;

  return (
    <ToolCard
      icon={TrendingUp}
      title={`Top ads · by ${METRIC_LABEL[metric] ?? metric}`}
      hint={`${ads.length} of ${matched}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <MiniSelect
          value={metric}
          onChange={(v) => setMetric(v as Metric)}
          title="Rank by"
        >
          {METRIC_OPTIONS.map((m) => (
            <option key={m} value={m}>
              by {METRIC_LABEL[m] ?? m}
            </option>
          ))}
        </MiniSelect>
        <MiniSelect value={objective} onChange={setObjective} title="Objective">
          <option value="">All funnels</option>
          {OBJECTIVE_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {objectiveLabel(o)}
            </option>
          ))}
        </MiniSelect>
        <MiniSelect
          value={destination}
          onChange={setDestination}
          title="Destination"
        >
          <option value="">Any destination</option>
          {DESTINATION_OPTIONS.map((d) => (
            <option key={d} value={d}>
              {destinationLabel(d)}
            </option>
          ))}
        </MiniSelect>
        <MiniSelect
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          title="Status"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </MiniSelect>
        {isFetching && (
          <Loader2 className="text-muted-foreground h-3.5 w-3.5 animate-spin" />
        )}
        <span className="ml-auto">
          {ads.length > 0 && (
            <CopyButton text={rankedDigest(view)} label="Copy" />
          )}
        </span>
      </div>
      <p className="text-muted-foreground mb-1 flex items-center gap-1 text-[11px]">
        <Target className="h-3 w-3" />
        {fmtWindow(window)}
      </p>
      {ads.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No ads match this scope.
        </p>
      ) : (
        <ul className="divide-y">
          {ads.map((ad) => (
            <RankedAdRow key={ad.id} ad={ad} />
          ))}
        </ul>
      )}
    </ToolCard>
  );
}

/** Fallback for any tool without a typed card yet — collapsible raw JSON. */
export function GenericToolCard({
  name,
  label,
  action,
  output,
}: {
  name: string;
  label?: string;
  action?: string;
  output: unknown;
}) {
  return (
    <details className="bg-card rounded-lg border px-3.5 py-2.5">
      <summary className="text-muted-foreground cursor-pointer text-xs font-medium">
        <span className="text-foreground">{label ?? action ?? name}</span>
        {action && (
          <span className="ml-2 font-mono text-[10px] font-normal opacity-60">
            {action}
          </span>
        )}
      </summary>
      <pre className="mt-2 overflow-x-auto text-xs">
        {JSON.stringify(output, null, 2)}
      </pre>
    </details>
  );
}

type ProductCardRecord = Record<string, unknown>;

const asProductCardRecord = (value: unknown): ProductCardRecord | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as ProductCardRecord)
    : null;

const productActionLabels: Record<string, string> = {
  "productAtlasRead.list": "Product Atlas overview",
  "productAtlasRead.get": "Product Atlas",
  "storefrontRead.list": "Storefront overview",
  "storefrontRead.get": "Storefront details",
  "productAtlasWrite.create": "Product created",
  "productAtlasWrite.update": "Product Atlas updated",
  "storefrontWrite.create": "Storefront created",
  "storefrontWrite.update": "Storefront target updated",
  "storefrontWrite.markStale": "Storefront marked stale",
  "storefrontWrite.confirmCurrent": "Storefront confirmed current",
  "storefrontWrite.assignManager": "Storefront manager updated",
  "storefrontWrite.copySiblingContent": "Storefront content copied",
};

/** Compact first-class result for Product Atlas and storefront chat actions. */
export function ProductCapabilityCard({
  action,
  output,
}: {
  action?: string;
  output: unknown;
}) {
  const record = asProductCardRecord(output);
  const products = Array.isArray(record?.products) ? record.products : null;
  const storefronts = Array.isArray(output)
    ? output
    : Array.isArray(record?.storefronts)
      ? record.storefronts
      : null;
  const product =
    asProductCardRecord(record?.product) ??
    (record && (record.atlas || record.lifecycleStatus) ? record : null);
  const storefront =
    asProductCardRecord(record?.storefront) ??
    (record?.surface && record.freshnessStatus ? record : null);
  const productId = typeof product?.id === "string" ? product.id : undefined;
  const storefrontId =
    typeof storefront?.id === "string" ? storefront.id : undefined;
  const href = storefrontId
    ? `/app/apps/${storefrontId}`
    : productId
      ? `/app/product-atlas/${productId}`
      : undefined;

  const summary = products
    ? `${products.length} product${products.length === 1 ? "" : "s"}`
    : storefronts
      ? `${storefronts.length} storefront${storefronts.length === 1 ? "" : "s"}`
      : storefront
        ? [
            storefront.surface,
            storefront.listingStatus,
            storefront.freshnessStatus,
          ]
            .filter((value): value is string => typeof value === "string")
            .join(" · ")
        : typeof product?.name === "string"
          ? [product.name, product.lifecycleStatus]
              .filter((value): value is string => typeof value === "string")
              .join(" · ")
          : "Product workspace updated";

  return (
    <div className="bg-card rounded-lg border px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <CircleDot className="h-3.5 w-3.5 text-emerald-500" />
        <p className="text-xs font-medium">
          {productActionLabels[action ?? ""] ?? "Product workspace"}
        </p>
        {href && (
          <Link
            href={href}
            className="text-primary ml-auto flex items-center gap-1 text-xs hover:underline"
          >
            Open
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <p className="text-muted-foreground mt-1 text-xs">{summary}</p>
      <details className="mt-2">
        <summary className="text-muted-foreground cursor-pointer text-[11px]">
          Inspect data
        </summary>
        <pre className="mt-2 max-h-80 overflow-auto text-xs">
          {JSON.stringify(output, null, 2)}
        </pre>
      </details>
    </div>
  );
}
