import type { PlatformCampaign } from "@/server/db/ads-schema";
import { resolveMetaSchedule } from "@/lib/meta-schedule";
import {
  META_DEFAULT_PLACEMENTS,
  META_PLACEMENTS,
} from "@/lib/meta-placement-plan";
import { importedPlacementLabel } from "@/lib/meta-preview";
import { money, fmtDate } from "./format";

export function MetaDeliverySummary({
  pc,
  accountName,
  pageId,
  campaignStartAt,
  campaignEndAt,
}: {
  pc: PlatformCampaign;
  accountName?: string | null;
  pageId?: string | null;
  campaignStartAt?: Date | null;
  campaignEndAt?: Date | null;
}) {
  const meta = pc.settings?.meta;
  const schedule = resolveMetaSchedule({
    startAt: pc.startAt,
    endAt: pc.endAt,
    campaignStartAt,
    campaignEndAt,
    ...meta,
  });
  const placements =
    meta?.placements ?? (pc.status === "draft" ? META_DEFAULT_PLACEMENTS : []);
  const selected = META_PLACEMENTS.filter((p) => placements.includes(p.id));
  const goal =
    meta?.goal ??
    (pc.status === "draft" ? "conversions" : (pc.objective ?? "Not recorded"));
  const facts = [
    ["Goal", goal.charAt(0).toUpperCase() + goal.slice(1).replaceAll("_", " ")],
    [
      "Budget",
      pc.budget != null
        ? `${money(pc.budget)}${pc.budgetType === "lifetime" ? " lifetime" : " / day"}`
        : "Not set",
    ],
    [
      "Allocation",
      meta?.budgetMode === "abo"
        ? "Per ad set (ABO)"
        : meta || pc.status === "draft"
          ? "Campaign (CBO)"
          : "Not recorded",
    ],
    [
      "Ad account",
      accountName ?? meta?.destination?.adAccountId ?? "Not configured",
    ],
    [
      "Facebook Page",
      pageId ?? (pc.status === "draft" ? "Not configured" : "Not recorded"),
    ],
    [
      "Ends",
      schedule.endAt ? fmtDate(new Date(schedule.endAt)) : "Runs until paused",
    ],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-sm font-semibold break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <dl className="grid grid-cols-1 gap-4 @sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Placements</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {selected.length ? (
              selected.map((p) => (
                <span
                  key={p.id}
                  className="rounded-full bg-muted px-2 py-1 text-xs"
                >
                  {p.label}
                </span>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">
                {meta?.importSource
                  ? importedPlacementLabel(meta.importSource.adSets)
                  : pc.status === "draft"
                    ? "Not set"
                    : "Not recorded"}
              </span>
            )}
          </dd>
        </div>
        {goal === "conversions" && (
          <div className="min-w-0">
            <dt className="text-xs text-muted-foreground">
              Conversion tracking
            </dt>
            <dd className="mt-1 text-sm font-semibold break-words">
              {meta?.customConversionId
                ? `Custom conversion ${meta.customConversionId}`
                : meta?.pixelId && meta.customEventType
                  ? `${meta.customEventType} · Pixel ${meta.pixelId}`
                  : "Not configured"}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}
