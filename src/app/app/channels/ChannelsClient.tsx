"use client";

import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { cn } from "@/components/ui/lib/utils";
import { PILLAR_BY_SLUG } from "@/lib/pillars";

const ARCHETYPE_LABEL: Record<string, string> = {
  image: "Image",
  carousel: "Carousel",
  video_short: "Short",
  video_long: "Video",
  text: "Text",
  thread: "Thread",
  story: "Story",
  link: "Link",
  article: "Longform",
  other: "Other",
};

export type BrandChannels = {
  id: string;
  name: string;
  mixTotal: number;
  mixRows: {
    pillar: string;
    count: number;
    pct: number;
    targetPct: number | null;
  }[];
  channels: {
    id: string;
    platform: string;
    handle: string | null;
    followerCount: number | null;
    fingerprint: string | null;
    // Per-channel mix OVERRIDE (mix_target rows with channelId) — what the
    // slot generator allocates pillars from on this channel.
    mixTargets: { pillar: string; targetPct: number }[];
    postsInWindow: number;
    archetypes: { archetype: string; perWeek: number; target: number | null }[];
  }[];
};

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;
const pillarName = (slug: string) =>
  slug === "__unsorted" ? "Unsorted" : (PILLAR_BY_SLUG[slug]?.name ?? slug);
const pillarColor = (slug: string) =>
  slug === "__unsorted"
    ? "var(--color-muted-foreground)"
    : (PILLAR_BY_SLUG[slug]?.color ?? "var(--color-muted-foreground)");

export function ChannelsClient({
  brands,
  windowDays,
}: {
  brands: BrandChannels[];
  windowDays: number;
}) {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Channels</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        Each brand&apos;s channels — voice, cadence, and content mix.{" "}
        <span className="text-muted-foreground/70">
          Observed = last {windowDays} days; targets from cadence &amp; mix when set.
        </span>
      </p>

      <div className="mt-6 flex flex-col gap-5">
        {brands.length === 0 && (
          <p className="text-muted-foreground text-sm">No brands yet.</p>
        )}
        {brands.map((b) => (
          <section key={b.id} className="overflow-hidden rounded-xl border">
            <div className="bg-muted/30 flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="text-sm font-semibold">{b.name}</h2>
              <span className="text-muted-foreground text-xs tabular-nums">
                {b.mixTotal} posts · {b.channels.length} channels
              </span>
            </div>

            {/* Pillar content mix (observed vs target) */}
            <div className="border-b px-4 py-3">
              <div className="text-muted-foreground mb-1.5 text-[11px] font-medium uppercase tracking-wide">
                Content mix
              </div>
              {b.mixTotal === 0 ? (
                <p className="text-muted-foreground text-xs">No posts in window.</p>
              ) : (
                <>
                  <div className="bg-muted/40 flex h-2.5 overflow-hidden rounded-full">
                    {b.mixRows.map((m) =>
                      m.pct > 0 ? (
                        <span
                          key={m.pillar}
                          title={`${pillarName(m.pillar)} · ${m.pct}%`}
                          style={{ width: `${m.pct}%`, background: pillarColor(m.pillar) }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                    {b.mixRows.map((m) => {
                      const under = m.targetPct != null && m.pct < m.targetPct;
                      return (
                        <span key={m.pillar} className="flex items-center gap-1 text-[11px]">
                          <span
                            className="size-2 rounded-full"
                            style={{ background: pillarColor(m.pillar) }}
                          />
                          <span className="text-foreground/90">{pillarName(m.pillar)}</span>
                          <span className="text-muted-foreground tabular-nums">{m.pct}%</span>
                          {m.targetPct != null && (
                            <span
                              className={cn(
                                "tabular-nums",
                                under ? "text-amber-400" : "text-muted-foreground/60",
                              )}
                            >
                              (target {m.targetPct}%)
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Channels */}
            <div className="divide-y">
              {b.channels.length === 0 && (
                <p className="text-muted-foreground px-4 py-3 text-xs">
                  No connected channels.
                </p>
              )}
              {b.channels.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex w-44 shrink-0 items-center gap-2">
                    <ChannelLogo platform={c.platform} className="size-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {platformLabel(c.platform)}
                      </div>
                      <div className="text-muted-foreground truncate text-[11px]">
                        {c.handle ?? "—"}
                        {c.followerCount ? ` · ${fmt(c.followerCount)} followers` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    {/* cadence chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground text-[11px] tabular-nums">
                        {(c.postsInWindow / (windowDays / 7)).toFixed(1)}/wk
                      </span>
                      {c.archetypes.length === 0 && (
                        <span className="text-muted-foreground/60 text-[11px]">
                          nothing in window
                        </span>
                      )}
                      {c.archetypes.map((a) => {
                        const under = a.target != null && a.perWeek < a.target;
                        return (
                          <span
                            key={a.archetype}
                            className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] tabular-nums",
                              under
                                ? "border-amber-500/40 text-amber-300"
                                : "border-border text-muted-foreground",
                            )}
                          >
                            {ARCHETYPE_LABEL[a.archetype] ?? a.archetype}{" "}
                            {a.perWeek.toFixed(1)}/wk
                            {a.target != null && (
                              <span className="opacity-60"> · t{a.target.toFixed(0)}</span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                    {/* per-channel mix override (what the slot generator uses) */}
                    {c.mixTargets.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="text-muted-foreground/60 text-[10px] font-medium tracking-wide uppercase">
                          Mix target
                        </span>
                        {c.mixTargets.map((m) => (
                          <span key={m.pillar} className="flex items-center gap-1 text-[11px]">
                            <span
                              className="size-2 rounded-full"
                              style={{ background: pillarColor(m.pillar) }}
                            />
                            <span className="text-muted-foreground">{pillarName(m.pillar)}</span>
                            <span className="text-muted-foreground/70 tabular-nums">
                              {m.targetPct}%
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* voice fingerprint */}
                    {c.fingerprint && (
                      <p className="text-muted-foreground mt-1.5 line-clamp-2 text-[11px] italic">
                        {c.fingerprint}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
