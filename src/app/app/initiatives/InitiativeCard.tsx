import Link from "next/link";
import {
  Archive,
  CalendarDays,
  Circle,
  CircleCheck,
  CirclePause,
  Clock3,
  FileText,
  Mail,
  Megaphone,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/lib/utils";
import type { listInitiatives } from "@/server/services/initiative.service";

export type InitiativeCardData = Awaited<
  ReturnType<typeof listInitiatives>
>["initiatives"][number];
type Sections = InitiativeCardData["summary"]["sections"];
type Item = Sections["ads"]["items"][number];

const statusIcons: Record<string, LucideIcon> = {
  planned: CalendarDays,
  active: Megaphone,
  paused: CirclePause,
  completed: CircleCheck,
  archived: Archive,
};

const day = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));

function dateLabel(i: InitiativeCardData) {
  if (i.startAt && i.endAt && i.startAt !== i.endAt)
    return `${day(i.startAt)} – ${day(i.endAt)}`;
  if (i.startAt) return `Starts ${day(i.startAt)}`;
  if (i.endAt) return `Ends ${day(i.endAt)}`;
  return `Updated ${day(i.updatedAt)}`;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

function Panel({
  icon: Icon,
  label,
  count,
  wide = false,
  children,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border bg-background p-2",
        wide ? "flex-[1.5]" : "flex-1",
      )}
    >
      <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
        <Icon className="size-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
        <span className="ml-auto tabular-nums">{count}</span>
      </span>
      {children}
    </div>
  );
}

/** Thumbnail-sized stand-ins for the first ads or posts; the rest as a count. */
function MiniTiles({ items, count }: { items: Item[]; count: number }) {
  const more = count - items.length;
  return (
    <div className="grid grid-cols-2 gap-1">
      {items.map((item, index) => (
        <span
          key={item.media?.url ?? `${item.text}-${index}`}
          className="relative aspect-square min-w-0 overflow-hidden rounded-md border bg-muted"
          title={item.text ?? undefined}
        >
          {item.media ? (
            // oxlint-disable-next-line nextjs/no-img-element
            <img
              src={item.media.url}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : (
            <span className="line-clamp-4 p-1 text-[7px] leading-tight text-muted-foreground">
              {item.text}
            </span>
          )}
          {more > 0 && index === items.length - 1 ? (
            <span className="absolute right-0.5 bottom-0.5 rounded bg-background/90 px-1 text-[9px] font-medium tabular-nums">
              +{more}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function SectionBoard({ sections }: { sections: Sections }) {
  const { ads, social, editorial } = sections;
  if (!ads.count && !social.count && !editorial.count)
    return (
      <div className="grid h-full place-items-center text-muted-foreground/60">
        <Megaphone className="size-5" aria-hidden="true" />
      </div>
    );
  const moreEditorial = editorial.count - editorial.items.length;
  return (
    <div className="flex h-full gap-2">
      {ads.count ? (
        <Panel icon={Megaphone} label="Ads" count={ads.count}>
          <MiniTiles items={ads.items} count={ads.count} />
        </Panel>
      ) : null}
      {social.count ? (
        <Panel icon={MessageSquare} label="Social" count={social.count}>
          <MiniTiles items={social.items} count={social.count} />
        </Panel>
      ) : null}
      {editorial.count ? (
        <Panel icon={Mail} label="Email & blog" count={editorial.count} wide>
          <ul className="flex min-w-0 flex-col gap-1">
            {editorial.items.map((item, index) => {
              const Icon = item.kind === "blog" ? FileText : Mail;
              return (
                <li
                  key={`${item.title}-${index}`}
                  className="flex min-w-0 items-center gap-1 rounded-md border px-1 py-0.5 text-[9px] leading-tight"
                >
                  <Icon
                    className="size-2.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="truncate">{item.title}</span>
                </li>
              );
            })}
            {moreEditorial > 0 ? (
              <li className="text-[9px] text-muted-foreground tabular-nums">
                +{moreEditorial} more
              </li>
            ) : null}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

export function InitiativeCard({
  initiative,
}: {
  initiative: InitiativeCardData;
}) {
  const i = initiative;
  const StatusIcon = statusIcons[i.status] ?? Circle;
  const { brands, sections } = i.summary;
  return (
    <Link
      href={`/app/initiatives/${i.id}`}
      className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      <div className="border-b bg-muted/40 p-2.5">
        <SectionBoard sections={sections} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-3">
          <h3
            className="line-clamp-2 text-base leading-snug font-semibold [overflow-wrap:anywhere] group-hover:underline"
            title={i.name}
          >
            {i.name}
          </h3>
          <Badge variant="outline" className="shrink-0 capitalize">
            <StatusIcon aria-hidden="true" />
            {i.status}
          </Badge>
        </div>
        {i.description ? (
          <p className="line-clamp-2 text-sm leading-relaxed [overflow-wrap:anywhere] text-muted-foreground">
            {i.description}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t px-4 py-2.5 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          {brands.length ? (
            <>
              <span className="flex shrink-0 -space-x-1.5">
                {brands.slice(0, 4).map((brand) => (
                  <span
                    key={brand.id}
                    title={brand.name}
                    className="grid size-5 place-items-center overflow-hidden rounded-full border bg-background text-[9px] font-semibold text-foreground"
                  >
                    {brand.logo ? (
                      // oxlint-disable-next-line nextjs/no-img-element
                      <img
                        src={brand.logo}
                        alt=""
                        className="size-full object-contain p-0.5"
                      />
                    ) : (
                      brand.name.slice(0, 1)
                    )}
                  </span>
                ))}
              </span>
              <span className="truncate">
                {brands.length === 1
                  ? brands[0]!.name
                  : plural(brands.length, "brand")}
              </span>
            </>
          ) : (
            <span>No brand</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {i.startAt || i.endAt ? (
            <CalendarDays className="size-3.5" aria-hidden="true" />
          ) : (
            <Clock3 className="size-3.5" aria-hidden="true" />
          )}
          {dateLabel(i)}
        </span>
      </div>
    </Link>
  );
}
