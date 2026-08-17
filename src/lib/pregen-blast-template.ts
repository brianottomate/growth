/**
 * The one-size-fits-all blast sequence, hardcoded.
 *
 * This is the other side of the internal debate: one template every prospect
 * gets, with only the name, company, and preview link merged in. It exists so
 * the debate can happen over two real sequences on one screen instead of over
 * adjectives — the lead page renders this beside the bespoke draft, per lead.
 *
 * Deliberately plain template literals, no model anywhere. When the real blast
 * copy lands from sales, replace the strings here and the comparison view
 * updates everywhere at once. Until then this is a faithful stand-in: the
 * register HubSpot one-template sequences are usually written in, four touches
 * on the same day spacing the bespoke generator uses.
 *
 * Client-safe on purpose, same as pregen-urls: the detail page computes it in
 * the browser from data it already has, no round trip.
 */
import { outreachLinkFor } from "@/lib/pregen-urls";

export type BlastStep = {
  delayDays: number;
  /** Absent means in-thread — a reply to the previous touch. */
  subject?: string;
  body: string;
};

export function blastSequenceFor(input: {
  firstName?: string | null;
  companyName?: string | null;
  domain: string;
  previewUrl: string | null;
}): BlastStep[] {
  const name = input.firstName?.trim() || "there";
  const company = input.companyName?.trim() || input.domain;
  const link = input.previewUrl
    ? outreachLinkFor(input.previewUrl, input.domain, {
        campaign: "pregen_blast",
      })
    : "[preview link]";

  return [
    {
      delayDays: 0,
      subject: `We built ${company} a direct booking site`,
      body: `Hi ${name},

We went ahead and built a direct booking website for ${company} — it's live now, with your properties already on it:

${link}

It runs on WanderOS, the platform we use to power direct bookings for vacation rental managers. The preview is yours to look at either way, and if you like it, making it real takes about 15 minutes.

Worth a look?`,
    },
    {
      delayDays: 3,
      body: `Hi ${name},

Floating this back up — the site we built for ${company} is still live if you haven't had a chance to open it:

${link}

Happy to answer anything, or to tweak it if something looks off.`,
    },
    {
      delayDays: 7,
      body: `Hi ${name},

One number worth knowing: every booking that comes through your own site instead of an OTA keeps 15–20% that would otherwise go to commission. That's what the site we built is for.

${link}

If direct booking isn't a priority for ${company} right now, no problem — just say so and I'll close this out.`,
    },
    {
      delayDays: 12,
      body: `Hi ${name},

Last note from me. The preview for ${company} stays up a little while longer if you want to look later:

${link}

If the timing's wrong, I'll leave you alone — and if it's ever right, you know where to find me.`,
    },
  ];
}
