import { redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/server/db";
import { brandTable, lifecycleCampaignTable } from "@/server/db/schema";
import type { LifecycleRunState } from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { resolveLifecycleOrganizationId } from "@/server/services/lifecycle.service";
import { LifecycleTabs } from "./LifecycleTabs";

const RUN_STATE: Record<
  LifecycleRunState,
  { label: string; dot: string; cls: string }
> = {
  running: { label: "Running", dot: "bg-emerald-400", cls: "text-emerald-300" },
  paused: { label: "Paused", dot: "bg-amber-400", cls: "text-amber-300" },
  needs_fixing: {
    label: "Needs fixing",
    dot: "bg-red-400",
    cls: "text-red-300",
  },
  planned: { label: "Planned", dot: "bg-sky-400", cls: "text-sky-300" },
  draft: {
    label: "Draft",
    dot: "bg-muted-foreground",
    cls: "text-muted-foreground",
  },
  stopped: {
    label: "Stopped",
    dot: "bg-muted-foreground",
    cls: "text-muted-foreground",
  },
  ended: {
    label: "Ended",
    dot: "bg-muted-foreground",
    cls: "text-muted-foreground",
  },
};

// Display order — most operationally relevant first.
const ORDER: LifecycleRunState[] = [
  "needs_fixing",
  "running",
  "paused",
  "planned",
  "draft",
  "stopped",
  "ended",
];

const KIND_LABEL: Record<string, string> = {
  onboarding: "Onboarding",
  abandoned_cart: "Abandoned cart",
  reactivation: "Reactivation",
  revival: "Revival",
  transactional: "Transactional",
  behavioral: "Behavioral",
  broadcast: "Broadcast",
  other: "Other",
};

const fmt = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : `${n}`;

const PROVIDER_LABEL: Record<string, string> = {
  customerio: "Customer.io",
  outreach: "Outreach",
  instantly: "Instantly",
  hubspot: "HubSpot",
  postmark: "Postmark",
  resend: "Resend",
};

export default async function LifecyclePage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const organizationId = await resolveLifecycleOrganizationId({
    userId: session.user.id,
    preferredOrganizationId: session.session.activeOrganizationId,
  });

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  const brandIds = brands.map((b) => b.id);

  const campaigns = brandIds.length
    ? await db.query.lifecycleCampaignTable.findMany({
        where: and(
          inArray(lifecycleCampaignTable.brandId, brandIds),
          isNull(lifecycleCampaignTable.deletedAt),
        ),
        with: { touchpoints: true },
      })
    : [];

  const cleanupCount = campaigns.filter(
    (c) =>
      c.cleanupStatus === "candidate" || c.cleanupStatus === "should_delete",
  ).length;
  const byState = (s: LifecycleRunState) =>
    campaigns
      .filter((c) => c.runState === s)
      .sort((a, b) => a.name.localeCompare(b.name));

  const mirror = (
    <div>
      {/* run-state summary */}
      <div className="mt-2 flex flex-wrap gap-2 border-b pb-4">
        {ORDER.map((s) => {
          const n = campaigns.filter((c) => c.runState === s).length;
          if (!n) return null;
          const meta = RUN_STATE[s];
          return (
            <span
              key={s}
              className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs"
            >
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              <span className={meta.cls}>{meta.label}</span>
              <span className="text-muted-foreground tabular-nums">{n}</span>
            </span>
          );
        })}
      </div>

      {campaigns.length === 0 && (
        <p className="mt-10 text-sm text-muted-foreground">
          No lifecycle automations yet. Run{" "}
          <code className="font-mono">bun run scripts/import-cio.ts</code>.
        </p>
      )}

      {ORDER.map((s) => {
        const list = byState(s);
        if (!list.length) return null;
        const meta = RUN_STATE[s];
        return (
          <section key={s} className="mt-8">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              <span className={`size-1.5 rounded-full ${meta.dot}`} />
              {meta.label} · {list.length}
            </h2>
            <div className="flex flex-col gap-2">
              {list.map((c) => {
                const matched = c.metrics?.matched ?? c.metrics?.sent ?? 0;
                const cleanup =
                  c.cleanupStatus === "candidate" ||
                  c.cleanupStatus === "should_delete";
                return (
                  <a
                    key={c.id}
                    href={c.externalUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl border bg-card p-3.5 transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.name}
                        </span>
                        <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {KIND_LABEL[c.kind] ?? c.kind}
                        </span>
                        {cleanup && (
                          <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                            cleanup
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                        {c.triggerEvent && <span>⚡ {c.triggerEvent}</span>}
                        {c.touchpoints.length > 0 && (
                          <span>
                            {c.touchpoints.length} touchpoint
                            {c.touchpoints.length === 1 ? "" : "s"}
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          {c.externalKind === "transactional"
                            ? "transactional"
                            : (c.externalKind ?? "campaign")}{" "}
                          · via{" "}
                          {PROVIDER_LABEL[c.provider ?? ""] ?? "Customer.io"}
                        </span>
                      </div>
                    </div>
                    {matched > 0 && (
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">
                          {fmt(matched)}
                        </div>
                        <div className="text-[10px] tracking-wide text-muted-foreground uppercase">
                          reached
                        </div>
                      </div>
                    )}
                    <span className="text-xs text-muted-foreground">↗</span>
                  </a>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lifecycle</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What we want vs. what runs in Customer.io &amp; Outreach ·{" "}
            <span className="text-amber-300">{cleanupCount} cleanup</span>{" "}
            candidates
          </p>
        </div>
      </div>

      <LifecycleTabs
        brands={brands.map((b) => ({ id: b.id, name: b.name }))}
        mirror={mirror}
        mirrorCount={campaigns.length}
      />
    </div>
  );
}
