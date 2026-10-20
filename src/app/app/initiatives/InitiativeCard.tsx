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

/** The first few ads or posts as thumbnails, the rest as a count. */
function Thumbs({ items, count }: { items: Item[]; count: number }) {
  const more = count - items.length;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {items.map((item, index) => (
        <span
          key={item.media?.url ?? `${item.text}-${index}`}
          className="size-7 overflow-hidden rounded-md border bg-muted"
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
            <span className="block size-full bg-muted" />
          )}
        </span>
      ))}
      {more > 0 ? (
        <span className="text-[10px] text-muted-foreground tabular-nums">
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/**
 * One line per kind of work in the initiative: what it is, how much, and a
 * glimpse. Stacked under the brand line so the card leads with the push
 * itself rather than its parts.
 */
function SectionRow({
  icon: Icon,
  label,
  count,
  children,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <li className="flex min-w-0 items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-xs">
      <Icon
        className="size-3.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="shrink-0 font-medium whitespace-nowrap">{label}</span>
      <span className="shrink-0 text-muted-foreground tabular-nums">
        {count}
      </span>
      <span className="ml-auto flex min-w-0 items-center">{children}</span>
    </li>
  );
}

function SectionRows({ sections }: { sections: Sections }) {
  const { ads, social, editorial } = sections;
  if (!ads.count && !social.count && !editorial.count) return null;
  const lead = editorial.items[0];
  const moreEditorial = editorial.count - (lead ? 1 : 0);
  const LeadIcon = lead?.kind === "blog" ? FileText : Mail;
  return (
    <ul className="flex flex-col gap-1.5">
      {ads.count ? (
        <SectionRow icon={Megaphone} label="Ads" count={ads.count}>
          <Thumbs items={ads.items.slice(0, 3)} count={ads.count} />
        </SectionRow>
      ) : null}
      {social.count ? (
        <SectionRow icon={MessageSquare} label="Social" count={social.count}>
          <Thumbs items={social.items.slice(0, 3)} count={social.count} />
        </SectionRow>
      ) : null}
      {editorial.count ? (
        <SectionRow icon={Mail} label="Email & blog" count={editorial.count}>
          {lead ? (
            <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
              <LeadIcon className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{lead.title}</span>
              {moreEditorial > 0 ? (
                <span className="shrink-0 tabular-nums">+{moreEditorial}</span>
              ) : null}
            </span>
          ) : null}
        </SectionRow>
      ) : null}
    </ul>
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
      <div className="flex flex-col gap-2.5 border-t bg-muted/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
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
        <SectionRows sections={sections} />
      </div>
    </Link>
  );
}
