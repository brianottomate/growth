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
    | { kind: "quote"; authorName: string; text: string | null; thumb: string | null }
    | { kind: "article"; card: LinkCard };
};

const PLATFORM_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  instagram: "Instagram",
};

function Avatar({ name }: { name: string }) {
  return (
    <span className="bg-accent text-foreground/80 flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
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
        // eslint-disable-next-line @next/next/no-img-element -- external og:image hosts aren't in remotePatterns
        <img
          src={card.image}
          alt=""
          className="aspect-[1.91/1] w-full object-cover"
        />
      )}
      <div className="px-3 py-2">
        <div className="text-muted-foreground text-[11px]">{card.domain}</div>
        <div className="truncate text-xs font-medium">{card.title}</div>
        {card.description && (
          <div className="text-muted-foreground line-clamp-2 text-[11px]">
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
        <div className="text-muted-foreground line-clamp-3 text-[11px] whitespace-pre-line">
          {embed.text ?? "…"}
        </div>
      </div>
      {embed.thumb && (
        // eslint-disable-next-line @next/next/no-img-element
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
        <div key={sim.linkId} className="bg-card/50 rounded-lg border px-3 py-2">
          <div className="text-muted-foreground mb-1.5 text-[10px]">
            ↻ how it unfolds on{" "}
            {PLATFORM_LABEL[sim.platform] ?? sim.platform} — planned repost
          </div>
          <div className="flex items-start gap-2">
            <Avatar name={sim.actorName} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium">
                {sim.actorName}
                {sim.actorHandle && (
                  <span className="text-muted-foreground ml-1 font-normal">
                    @{sim.actorHandle}
                  </span>
                )}
                <span className="text-muted-foreground font-normal">
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

/** Standalone unfurl for a URL found in a spot's drafted copy. */
export function LinkCardStrip({ card }: { card: LinkCard | null }) {
  if (!card) return null;
  return (
    <div className="mt-1.5 ml-6 max-w-md">
      <div className="text-muted-foreground mb-1 text-[10px]">
        link unfurl{card.predicted ? " — predicted from draft, not live yet" : ""}
      </div>
      <ArticleCard card={card} />
    </div>
  );
}
