import { redirect } from "next/navigation";
import { eq, inArray, isNull, and } from "drizzle-orm";

import { db } from "@/server/db";
import {
  brandTable,
  type ConversionFunnel,
  type ConversionStatus,
  conversionEventTable,
  conversionMappingTable,
  memberTable,
} from "@/server/db/schema";
import { getSession } from "@/server/better-auth/server";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { CopyButton } from "@/components/copy-button";

// The paid platforms the matrix has columns for (order = sheet order).
const AD_PLATFORMS = [
  "google_ads",
  "meta_ads",
  "reddit_ads",
  "linkedin_ads",
  "x_ads",
  "tiktok_ads",
] as const;

const FUNNELS: { key: ConversionFunnel; label: string; sub: string }[] = [
  { key: "supply", label: "Supply", sub: "WanderOS — host / operator" },
  { key: "demand", label: "Demand", sub: "wander.com — guest / booking" },
];

const STATUS_STYLE: Record<ConversionStatus, { badge: string; label: string }> =
  {
    verified: {
      badge: "bg-emerald-500/15 text-emerald-300",
      label: "verified",
    },
    wanted: { badge: "bg-amber-500/15 text-amber-300", label: "wanted" },
    not_implemented: { badge: "bg-red-500/15 text-red-300", label: "not impl" },
  };

type EventRow = typeof conversionEventTable.$inferSelect;
type MappingRow = typeof conversionMappingTable.$inferSelect & {
  sources: { conversionEventId: string }[];
  channel: { platform: string; manageUrl: string | null } | null;
};

/** One platform's mapping(s) for one event, or an empty cell. */
function Cell({ mappings }: { mappings: MappingRow[] }) {
  if (mappings.length === 0) {
    return <span className="text-xs text-muted-foreground/40">—</span>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {mappings.map((m) => {
        const s = STATUS_STYLE[m.status];
        return (
          <div key={m.id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${s.badge}`}
              >
                {s.label}
              </span>
              <span className="truncate text-xs font-medium">
                {m.platformEventName}
              </span>
              {m.sources.length > 1 && (
                <span className="rounded border px-1 text-[9px] text-muted-foreground">
                  shared
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {m.externalConversionId ? (
                <code
                  className="max-w-[160px] truncate rounded bg-muted px-1 py-0.5 font-mono"
                  title={m.externalConversionId}
                >
                  {m.externalConversionId}
                </code>
              ) : (
                <span className="italic">no id</span>
              )}
              {m.mode && <span>· {m.mode}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default async function ConversionsPage() {
  const session = await getSession();
  if (!session?.user) redirect("/signin");

  const membership = await db.query.memberTable.findFirst({
    where: eq(memberTable.userId, session.user.id),
    with: { organization: true },
  });
  const org = membership?.organization;
  if (!org) {
    return <div className="text-muted-foreground">No organization found.</div>;
  }

  const brands = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.organizationId, org.id),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, name: true },
  });
  const brandIds = brands.map((b) => b.id);

  const [events, mappings] = brandIds.length
    ? await Promise.all([
        db.query.conversionEventTable.findMany({
          where: inArray(conversionEventTable.brandId, brandIds),
        }),
        db.query.conversionMappingTable.findMany({
          where: inArray(conversionMappingTable.brandId, brandIds),
          with: {
            sources: { columns: { conversionEventId: true } },
            channel: { columns: { platform: true, manageUrl: true } },
          },
        }),
      ])
    : [[] as EventRow[], [] as MappingRow[]];

  const eventsByBrand = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = eventsByBrand.get(e.brandId) ?? [];
    list.push(e);
    eventsByBrand.set(e.brandId, list);
  }
  // cellMap: a mapping lands in a cell for EVERY event that feeds it, so the one
  // Reddit "Lead" mapping appears under both submit rows (one row, two cells).
  const cellMap = new Map<string, MappingRow[]>();
  for (const m of mappings) {
    for (const src of m.sources) {
      const key = `${src.conversionEventId}|${m.platform}`;
      const list = cellMap.get(key) ?? [];
      list.push(m);
      cellMap.set(key, list);
    }
  }
  const cell = (eventId: string, platform: string) =>
    cellMap.get(`${eventId}|${platform}`) ?? [];

  const totalMapped = mappings.filter((m) => m.status === "verified").length;

  // Markdown export for the AI sync pass / ChatGPT hand-off.
  const md = [
    `# Wander — Ad conversion matrix`,
    `${events.length} events · ${mappings.length} platform conversions · ${totalMapped} verified`,
    ...FUNNELS.flatMap(({ key, label }) => {
      const evs = events
        .filter((e) => e.funnel === key)
        .sort((a, b) => a.stage - b.stage);
      if (!evs.length) return [];
      return [
        `\n## ${label}`,
        ...evs.map((e) => {
          const rowMaps = AD_PLATFORMS.flatMap((p) =>
            cell(e.id, p).map(
              (m) =>
                `${platformLabel(p)}:${m.platformEventName}` +
                `${m.externalConversionId ? ` (${m.externalConversionId})` : ""} [${m.status}]`,
            ),
          );
          return `- ${e.name}${e.canonicalEvent ? ` → ${e.canonicalEvent}` : " → (no canonical event yet)"}${rowMaps.length ? ` — ${rowMaps.join(", ")}` : " — (no mappings)"}`;
        }),
      ];
    }),
  ].join("\n");

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ads · Conversions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What each ad platform should receive for every Wander funnel event —
            the intent, with its real-world status. Status is maintained by an
            AI pass against the wander.com / tracking code.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {events.length} events · {mappings.length} platform conversions ·{" "}
            {totalMapped} verified
          </p>
        </div>
        {mappings.length > 0 && (
          <CopyButton text={md} label="Copy for ChatGPT / Claude" />
        )}
      </div>

      {brands.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">No brands yet.</p>
      )}

      {brands.map((brand) => {
        const brandEvents = eventsByBrand.get(brand.id) ?? [];
        return (
          <section key={brand.id} className="mt-8">
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              {brand.name}
            </h2>
            {brandEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No conversion events yet.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full min-w-[860px] text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="w-56 p-3 text-xs font-semibold">Event</th>
                      {AD_PLATFORMS.map((p) => (
                        <th key={p} className="p-3 text-xs font-semibold">
                          <span className="flex items-center gap-1.5">
                            <ChannelLogo platform={p} className="size-4" />
                            {platformLabel(p)}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FUNNELS.map(({ key, label, sub }) => {
                      const rows = brandEvents
                        .filter((e) => e.funnel === key)
                        .sort((a, b) => a.stage - b.stage);
                      if (rows.length === 0) return null;
                      return (
                        <FunnelGroup
                          key={key}
                          label={label}
                          sub={sub}
                          rows={rows}
                          cell={cell}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FunnelGroup({
  label,
  sub,
  rows,
  cell,
}: {
  label: string;
  sub: string;
  rows: EventRow[];
  cell: (eventId: string, platform: string) => MappingRow[];
}) {
  return (
    <>
      <tr className="border-b bg-muted/40">
        <td
          colSpan={1 + AD_PLATFORMS.length}
          className="px-3 py-1.5 text-[11px] font-semibold tracking-wide uppercase"
        >
          {label}{" "}
          <span className="font-normal tracking-normal text-muted-foreground normal-case">
            · {sub}
          </span>
        </td>
      </tr>
      {rows.map((e) => (
        <tr key={e.id} className="border-b align-top last:border-0">
          <td className="p-3">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-medium">{e.name}</span>
              {e.isPrimary && (
                <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-medium text-sky-300">
                  primary
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {e.canonicalEvent ? (
                <code className="font-mono">{e.canonicalEvent}</code>
              ) : (
                <span className="text-amber-400">⚠ needs reconciliation</span>
              )}
            </div>
          </td>
          {AD_PLATFORMS.map((p) => (
            <td key={p} className="p-3">
              <Cell mappings={cell(e.id, p)} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
