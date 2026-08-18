/**
 * The one-size-fits-all blast, transcribed from the sequence that actually
 * sends: "Pre-gen site sequence" (309640366), authored and owned by Kyle.
 *
 * This is the other side of the internal debate: one email every prospect gets,
 * with only merge fields varying. It exists so the debate happens over two real
 * sequences on one screen rather than over adjectives, and so a reviewer can
 * read the template before anyone enrols a contact.
 *
 * It is a transcription and not a draft. HubSpot exposes no readable body for a
 * sales template, so the copy cannot be fetched and this literal is the only
 * place Growth knows what will land in an inbox. Edit it only to match a change
 * Kyle already made in HubSpot, never to improve the copy here first, and run
 * `bun --conditions=react-server scripts/check-pregen-sequence.ts` after — it
 * compares this shape against the live sequence and is what catches the drift.
 *
 * It was four touches until 2026-08-18, when Kyle replaced it with this single
 * email. The bespoke arm still generates four, so the side-by-side now shows
 * three touches the template does not answer. That asymmetry is the comparison,
 * not a bug in it.
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
  /** An array because HubSpot supports A/B subjects; this sequence sets one. */
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
  // HubSpot's own Company Domain Name, not a property this repo writes.
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
      subjects: [[text("We rebuilt "), domain, text(" for you")]],
      body: [
        text("Hi "),
        firstName,
        text(`,

My name is Kyle and I'm the CMO at Wander.com. We built a live preview of your direct booking site on WanderOS. No work on your end, just wanted you to see it.

`),
        link,
        text(`

WanderOS customers are also seeing a 66% average lift in visibility across AI search platforms (ChatGPT, Perplexity, etc.) after switching.

If it's useful, we can show you what else WanderOS unlocks to grow your business.`),
      ],
    },
  ];
}
