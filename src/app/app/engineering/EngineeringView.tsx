import type {
  DataHealth,
  TableStat,
  TableStatus,
} from "@/server/services/data-health.service";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  TableStatus,
  { label: string; dot: string; text: string }
> = {
  live: {
    label: "live",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  seed_only: {
    label: "seed only",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
  },
  empty: {
    label: "empty",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
  },
};

function relativeTime(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

const fmt = (n: number) => n.toLocaleString();

function StatusDot({ status }: { status: TableStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("size-2 rounded-full", meta.dot)} />
      <span className={cn("text-xs font-medium", meta.text)}>{meta.label}</span>
    </span>
  );
}

function TableRow({ t }: { t: TableStat }) {
  return (
    <div className="hover:bg-muted/40 grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded-md px-3 py-1.5 text-sm">
      <span className="truncate font-mono text-xs">
        {t.schema !== "public" && (
          <span className="text-muted-foreground">{t.schema}.</span>
        )}
        {t.name}
      </span>
      <span className="text-right tabular-nums">
        <span className={t.real === 0 ? "text-muted-foreground" : ""}>
          {fmt(t.real)}
        </span>
        {t.seed > 0 && (
          <span className="text-muted-foreground"> +{fmt(t.seed)} seed</span>
        )}
      </span>
      <span className="text-muted-foreground w-20 text-right text-xs tabular-nums">
        {relativeTime(t.lastWrite)}
      </span>
      <span className="w-24 text-right">
        <StatusDot status={t.status} />
      </span>
    </div>
  );
}

export function EngineeringView({ health }: { health: DataHealth }) {
  const { groups, scannedAt, totalTables, totalRows, emptyTables } = health;
  const emptyCount = emptyTables.filter((t) => t.status === "empty").length;
  const seedOnlyCount = emptyTables.filter(
    (t) => t.status === "seed_only",
  ).length;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 p-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Engineering</h1>
        <p className="text-muted-foreground text-sm">
          Live data-health view across every table. Real rows exclude{" "}
          <code className="text-xs">isSeed</code> data. Scanned{" "}
          {relativeTime(scannedAt)}.
        </p>
      </header>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Tables", value: fmt(totalTables) },
          { label: "Total rows", value: fmt(totalRows) },
          {
            label: "Empty",
            value: fmt(emptyCount),
            tone: emptyCount > 0 ? "text-rose-600 dark:text-rose-400" : "",
          },
          {
            label: "Seed only",
            value: fmt(seedOnlyCount),
            tone: seedOnlyCount > 0 ? "text-amber-600 dark:text-amber-400" : "",
          },
        ].map((s) => (
          <div key={s.label} className="bg-card rounded-lg border p-4">
            <div className={cn("text-2xl font-semibold tabular-nums", s.tone)}>
              {s.value}
            </div>
            <div className="text-muted-foreground text-xs">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Needs attention */}
      {emptyTables.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
          <h2 className="mb-2 text-sm font-medium">
            Weirdly empty ({emptyTables.length})
          </h2>
          <div className="flex flex-wrap gap-1.5">
            {emptyTables.map((t) => (
              <span
                key={`${t.schema}.${t.name}`}
                className="bg-background inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs"
                title={`${t.domain} · ${t.status}`}
              >
                <span
                  className={cn("size-1.5 rounded-full", STATUS_META[t.status].dot)}
                />
                {t.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Domain groups */}
      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.domain} className="bg-card rounded-lg border">
            <div className="flex items-baseline justify-between border-b px-4 py-2.5">
              <h2 className="text-sm font-semibold">
                {g.domain}
                {g.domain === "Unmapped" && (
                  <span className="text-muted-foreground ml-2 text-xs font-normal">
                    (add to DOMAIN_BY_TABLE)
                  </span>
                )}
              </h2>
              <span className="text-muted-foreground text-xs tabular-nums">
                {g.populated}/{g.tableCount} live · {fmt(g.totalRows)} rows
              </span>
            </div>
            <div className="p-1.5">
              {g.tables.map((t) => (
                <TableRow key={`${t.schema}.${t.name}`} t={t} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
