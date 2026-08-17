/**
 * The one-size-fits-all blast sequence, authored by Kyle.
 *
 * This is the other side of the internal debate: one template every prospect
 * gets, with only merge fields varying. It exists so the debate happens over
 * two real sequences on one screen rather than over adjectives, and so the
 * template is inspectable before anyone enrols a contact.
 *
 * Email 1 is Kyle's copy verbatim, punctuation included. Emails 2 to 4 are
 * drafted to his register: one idea each, short lines, the proof point stated
 * plainly, signed with a first name. Send-day spacing is a placeholder, since
 * he specified copy and not cadence.
 *
 * Bodies are parts rather than one string so the UI can mark what actually
 * varies. A reviewer asking "what does this lead receive" and a reviewer asking
 * "what does the template say" want different renderings of the same thing,
 * and a plain string can only answer one of them.
 *
 * Client-safe on purpose: the lead page computes it in the browser from data it
 * already holds.
 */
import { outreachLinkFor } from "@/lib/pregen-urls";

export type TemplatePart =
  | { kind: "text"; value: string }
  /** A HubSpot merge field: `field` is what the template shows, `value` what
      this lead resolves it to. */
  | { kind: "merge"; field: string; value: string }
  /** A hyperlink whose anchor text is fixed and whose target varies. */
  | { kind: "link"; text: string; url: string };

export type BlastStep = {
  delayDays: number;
  /** Kyle wrote two subject lines for touch 1; later touches reply in-thread. */
  subjects: TemplatePart[][];
  body: TemplatePart[];
};

/** The template as authored: merge fields shown by name, links by anchor text. */
export function renderTemplate(parts: TemplatePart[]): string {
  return parts
    .map((part) =>
      part.kind === "text"
        ? part.value
        : part.kind === "merge"
          ? `[${part.field}]`
          : part.text,
    )
    .join("");
}

/** What this lead actually receives. */
export function renderFilled(parts: TemplatePart[]): string {
  return parts
    .map((part) =>
      part.kind === "text"
        ? part.value
        : part.kind === "merge"
          ? part.value
          : `${part.text}\n${part.url}`,
    )
    .join("");
}

export function blastSequenceFor(input: {
  firstName?: string | null;
  companyName?: string | null;
  domain: string;
  previewUrl: string | null;
}): BlastStep[] {
  const text = (value: string): TemplatePart => ({ kind: "text", value });
  const firstName: TemplatePart = {
    kind: "merge",
    field: "first name",
    value: input.firstName?.trim() || "there",
  };
  const domain: TemplatePart = {
    kind: "merge",
    field: "website",
    value: input.domain,
  };
  const link: TemplatePart = {
    kind: "link",
    text: "See your preview →",
    url: input.previewUrl
      ? outreachLinkFor(input.previewUrl, input.domain, {
          campaign: "pregen_blast",
        })
      : "(no preview built for this lead)",
  };

  return [
    {
      delayDays: 0,
      subjects: [
        [text("We rebuilt "), domain, text(" for you")],
        [domain, text(", rebuilt")],
      ],
      body: [
        text("Hi "),
        firstName,
        text(`,

We built a live preview of your direct booking site on WanderOS — no work on your end, just wanted you to see it.

`),
        link,
        text(`

WanderOS customers are also seeing a 66% average lift in visibility across AI search platforms (ChatGPT, Perplexity, etc.) after switching.

If it's useful I can show you what else WanderOS unlocks to grow your business.

Kyle`),
      ],
    },
    {
      delayDays: 3,
      subjects: [],
      body: [
        text("Hi "),
        firstName,
        text(`,

Bumping this in case it got buried. Your preview is still up:

`),
        link,
        text(`

Nothing to rebuild on your side. WanderOS pulls listings, photos and rates from the PMS you already run.

Kyle`),
      ],
    },
    {
      delayDays: 7,
      subjects: [],
      body: [
        text("Hi "),
        firstName,
        text(`,

The reason we build these before asking for a call: every booking that comes through your own site is one you keep the commission on.

`),
        link,
        text(`

Happy to walk you through what switching looks like, or to leave it with you.

Kyle`),
      ],
    },
    {
      delayDays: 12,
      subjects: [],
      body: [
        text("Hi "),
        firstName,
        text(`,

Last one from me. Your preview stays up either way:

`),
        link,
        text(`

If direct booking isn't a priority this year, just say so and I'll leave it there. If it ever is, you know where to find me.

Kyle`),
      ],
    },
  ];
}
