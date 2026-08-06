import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  digestSectionSchema,
  type ListingsDigest,
} from "@/lib/listings-digest";

/**
 * Read whatever an operator pasted and turn it into a property digest.
 *
 * This started as a hand-written parser for one planning spreadsheet, which was
 * the wrong shape for the job: that sheet was a way to exercise the system, not
 * the format people will actually paste. A grammar tuned to it was overfitted
 * to a fixture and fell over on its own edge cases. Real input is a booking
 * list from an email, a few lines someone typed, a table from a doc — so
 * segmenting it is a reading task, and reading tasks belong to the model.
 *
 * The model's job is strictly transcription. It may not invent a home, a price
 * or a link, and it may not fill gaps with plausible values: a missing field
 * stays null so the operator sees a gap rather than a guess.
 */

const EXTRACTION_MODEL = "claude-sonnet-5";

// Same shape as ListingsDigest minus the schema tag, which is stamped on after.
const DigestExtraction = z.object({
  theme: z
    .string()
    .nullable()
    .describe("The editorial angle, if the source states one. Never invented."),
  rationale: z
    .string()
    .nullable()
    .describe("Why this send, if the source says so. Never invented."),
  sections: z.array(digestSectionSchema).min(1).max(10),
});

const SYSTEM = [
  "You transcribe a pasted block of property listings into structured data for a Wander newsletter digest.",
  "",
  "You are transcribing, not writing. Every value must come from the source text.",
  "- Never invent a home, a price, a guest count, a city or a URL.",
  "- Never compute a value the source did not state. If a per-person price is not written down, it is null.",
  "- Copy prices as whole dollars: '$1,315/nt' is 1315. '$584/nt = ~$32/person' is 584 nightly and 32 per person.",
  "- Copy names verbatim, including punctuation, pipes and parentheses that are part of the name.",
  "- A missing field is null. Never substitute a plausible value.",
  "",
  "Grouping:",
  "- A region, city cluster or destination heading starts a new section. If the source has no headings, use one section and give it a heading that names the places covered.",
  "- Mark a home `operated: true` when the source distinguishes it as Wander-operated (labels like OPERATED, a `*` bullet, or an explicit note). Otherwise false.",
  "- The operated home should be first in its section when there is one, since it renders as that section's hero.",
  "",
  "Links:",
  "- When a separate list of URLs follows the homes, it is in the SAME ORDER within each region. Pair by position, not by guessing which slug matches which name: the slugs frequently disagree with display names.",
  "- A home with no URL gets href: null.",
  "",
  "Never put a URL in the `name` field. If a line is only a URL, it is a link, not a home.",
].join("\n");

export type DigestExtractionResult = {
  digest: ListingsDigest | null;
  /** Anything the model read but could not place, for the operator to see. */
  notes: string[];
};

export async function extractDigest(
  pasted: string,
): Promise<DigestExtractionResult> {
  const { output } = await generateText({
    model: anthropic(EXTRACTION_MODEL),
    output: Output.object({
      schema: z.object({
        // An empty paste, or one with nothing property-shaped in it, has to be
        // expressible. Forcing a section would make the model manufacture one.
        found: z
          .boolean()
          .describe("False when the paste contains no property listings."),
        digest: DigestExtraction.nullable(),
        notes: z
          .array(z.string())
          .describe(
            "Lines or details you could not place, and any ambiguity the operator should resolve. Empty when everything was clear.",
          ),
      }),
    }),
    maxOutputTokens: 16_000,
    system: SYSTEM,
    prompt: ["# Pasted by the operator", "", pasted].join("\n"),
  });

  if (!output.found || !output.digest) {
    return { digest: null, notes: output.notes ?? [] };
  }
  return {
    digest: {
      schema: "wander-growth.listings-digest.v1",
      theme: output.digest.theme,
      rationale: output.digest.rationale,
      sections: output.digest.sections,
    },
    notes: output.notes ?? [],
  };
}
