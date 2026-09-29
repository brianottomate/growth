import {
  CAMPAIGN_COPY_INTENTS,
  COMPOSITION_TEMPLATES,
  type CampaignCopyTemplateId,
} from "@/lib/compositions";

/**
 * How a campaign ad's slides are written. One text for both surfaces that
 * write them, starter ideas and the ad chat, so they never pull a slide in
 * different directions. The house rules come from the performance team
 * (Silvina, 2026-09-29); what each slide holds is the copy guide in
 * `CAMPAIGN_COPY_INTENTS`. The Meta caption, headline and description line
 * have their own rules where they are written.
 */
export function campaignCopyRules(): string {
  const layouts = (
    Object.keys(CAMPAIGN_COPY_INTENTS) as CampaignCopyTemplateId[]
  )
    .map((id) => {
      const card = CAMPAIGN_COPY_INTENTS[id];
      const label = COMPOSITION_TEMPLATES.find((t) => t.id === id)?.label ?? id;
      const length = card.subtitleChars
        ? `The headline is at most about ${card.headlineChars} characters and the supporting line about ${card.subtitleChars}, one line each.`
        : `The headline is at most about ${card.headlineChars} characters so it stays on two lines; leave the supporting line empty.`;
      return `"${label}" slide: ${card.intent} ${length}`;
    })
    .join("\n\n");
  return `Slide copy is written from the listing, never from the photos. The listing data and the home's title are the only sources of truth; the title may be used when it says something the listing does not.

Before writing, find the home's strongest and most distinctive selling point that the listing states outright: its location, its style, its atmosphere or one notable characteristic. Build the slides around it.

Do not describe, interpret or infer anything from the images: the photo decides which stated fact a slide leads with, and the copy must never contradict it, but it never supplies a claim. Never invent or assume a feature. One signature feature the listing states can lead (a soaking tub, river views); everyday amenities never do, so no TV, kitchen, bathrooms, elevator or amenity lists, and never the bedroom count. Avoid generic phrases when a more specific selling point is available. No "luxury", "best", "stunning" or "perfect" unless the listing says so.

Keep it concise and natural, in a modern, elevated vacation-rental tone. Sentence case, "&" to join two ideas, never an em dash.

${layouts}`;
}
