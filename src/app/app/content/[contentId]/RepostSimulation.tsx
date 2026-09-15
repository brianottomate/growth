import type { LinkCard } from "@/server/services/unfurl.service";

// Simulated view of how a repost will unfold on the amplifier's feed.
// Pure presentation — the page assembles the data server-side. Two embed
// flavors, matching what platforms actually render for an injected URL:
//   - quote: a link to another post becomes an embedded mini-post
//   - article: a link to a page becomes an og-card (image, domain, title)

export type RepostSim = {
  linkId: string;
  /** Whose feed this appears on (the amplifier / owned personal brand). */
  actorName: string;
  actorHandle: string | null;
  platform: string;
  /** Repost comment; null = bare repost (retweet-style). */
  comment: string | null;
  embed:
    | {
        kind: "quote";
        authorName: string;
        text: string | null;
        thumb: string | null;
      }
    | { kind: "article"; card: LinkCard };
};

const PLATFORM_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
};

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-foreground/80">
      {name
        .split(" ")
        .map((part) => part[0])
        .slice(0, 2)
        .join("")}
    </span>
  );
}

function ArticleCard({ card }: { card: LinkCard }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      {card.image && (
        // oxlint-disable-next-line nextjs/no-img-element -- external og:image hosts aren't in remotePatterns
        <img
          src={card.image}
          alt=""
          className="aspect-[1.91/1] w-full object-cover"
        />
      )}
      <div className="px-3 py-2">
        <div className="text-[11px] text-muted-foreground">{card.domain}</div>
        <div className="truncate text-xs font-medium">{card.title}</div>
        {card.description && (
          <div className="line-clamp-2 text-[11px] text-muted-foreground">
            {card.description}
          </div>
        )}
      </div>
    </div>
  );
}

function QuoteEmbed({
  embed,
}: {
  embed: Extract<RepostSim["embed"], { kind: "quote" }>;
}) {
  return (
    <div className="flex gap-2.5 rounded-xl border px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium">{embed.authorName}</div>
        <div className="line-clamp-3 text-[11px] whitespace-pre-line text-muted-foreground">
          {embed.text ?? "…"}
        </div>
      </div>
      {embed.thumb && (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={embed.thumb}
          alt=""
          className="size-14 shrink-0 rounded-md border object-cover"
        />
      )}
    </div>
  );
}

/** One simulated feed item: actor header, optional comment, embedded unfurl. */
export function RepostSimulation({ sims }: { sims: RepostSim[] }) {
  if (sims.length === 0) return null;
  return (
    <div className="mt-1.5 ml-6 flex flex-col gap-1.5">
      {sims.map((sim) => (
        <div
          key={sim.linkId}
          className="rounded-lg border bg-card/50 px-3 py-2"
        >
          <div className="mb-1.5 text-[10px] text-muted-foreground">
            ↻ how it unfolds on {PLATFORM_LABEL[sim.platform] ?? sim.platform} —
            planned repost
          </div>
          <div className="flex items-start gap-2">
            <Avatar name={sim.actorName} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">
                {sim.actorName}
                {sim.actorHandle && (
                  <span className="ml-1 font-normal text-muted-foreground">
                    @{sim.actorHandle}
                  </span>
                )}
                <span className="font-normal text-muted-foreground">
                  {" "}
                  · reposts
                </span>
              </div>
              {sim.comment && (
                <p className="mt-0.5 text-xs whitespace-pre-line">
                  {sim.comment}
                </p>
              )}
              <div className="mt-1.5">
                {sim.embed.kind === "article" ? (
                  <ArticleCard card={sim.embed.card} />
                ) : (
                  <QuoteEmbed embed={sim.embed} />
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
