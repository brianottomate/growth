/**
 * The prompt that asks Adapt (Wander's data agent, which reads BigQuery and
 * the live site) to pick the homes for one newsletter issue.
 *
 * Finding homes stays there on purpose: it is an open-ended search over the
 * whole marketplace and the send history. What Growth owns is the question
 * and the shape of the answer. The rules are the newsletter's own (3 markets
 * × 3 homes, exact three-night all-in prices, a $5,000 cap, no recent
 * markets), and the reply format is the one Growth's paste reader turns
 * straight into the issue's homes and stay dates.
 */

export type AdaptHomesPromptInput = {
  title: string;
  hook?: string | null;
  purpose?: string | null;
  /** When the issue goes out. */
  sendDate?: Date | string | null;
  /** The stay every home is quoted for; Adapt proposes one when absent. */
  stayWindow?: { checkIn: string; checkOut: string } | null;
};

function day(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function adaptHomesPrompt(input: AdaptHomesPromptInput) {
  const stay = input.stayWindow
    ? `${day(input.stayWindow.checkIn)} to ${day(input.stayWindow.checkOut)}. Quote every home for exactly these dates.`
    : "Propose one three-night stay, one to three weeks after the send date, that fits the premise. Quote every home for those same dates.";
  return [
    "Find the homes for a Wander newsletter issue.",
    "",
    `Issue: ${input.title}`,
    input.sendDate ? `Send date: ${day(input.sendDate)}` : null,
    input.hook ? `Premise: ${input.hook}` : null,
    input.purpose ? `Purpose: ${input.purpose}` : null,
    `Stay: ${stay}`,
    "",
    "Rules:",
    "- 3 markets × 3 homes. Each market fits the premise and has not been featured in a Wander newsletter in the last eight weeks.",
    "- LUXURY or ICONIC tier only, live on wander.com and bookable for the stay dates.",
    "- Price each home for the stay, all-in (taxes and fees), at its max occupancy. No home over $5,000; where one exists, include an option around $1,000–$1,500 in each market.",
    "- Mix price levels within a market and mark any Wander-operated home.",
    "- Prefer homes with a strong exterior photo; the newsletter leads with it.",
    "",
    "Reply in exactly this format, nothing before or after it:",
    "",
    "Stays: YYYY-MM-DD to YYYY-MM-DD",
    "",
    "MARKET, STATE",
    "- Home name (City) | sleeps N | $TOTAL all-in | TIER",
    "- …",
    "",
    "(the other two markets the same way)",
    "",
    "Links (same order as the homes):",
    "https://www.wander.com/property/…",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}
