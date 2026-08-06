import { z } from "zod";

/**
 * The property-digest email: region sections, each with one operated hero and
 * a couple of listed homes.
 *
 * This exists because the digest is not a markdown document. `bodyMarkdown` can
 * carry an editorial issue perfectly well, but a digest is a *table* — nine
 * homes, each with a location, a guest count, a nightly rate, a per-person rate
 * and a deep link — and flattening that into prose loses exactly the structure
 * the template needs to lay out. So the digest travels as data on the same
 * email document, and the renderer dispatches on `templateKey`.
 *
 * The shape follows `emails/marketing/ListingsDigest.tsx`, which was modelled
 * on Customer.io newsletter 1551. Images are deliberately nullable: the
 * spreadsheet has no image column, and sourcing them from the media library is
 * a later step that should not block getting the words and numbers in.
 */

export const DIGEST_TEMPLATE_KEY = "listings-digest";

export const digestPropertySchema = z.object({
  /** "Wander Austin Grove" */
  name: z.string().trim().min(1).max(200),
  /** The city in parentheses in the sheet: "Austin". */
  city: z.string().trim().max(120).nullable().optional(),
  sleeps: z.number().int().positive().max(200).nullable().optional(),
  /** Nightly rate in whole dollars. 584 for "$584/nt". */
  nightlyUsd: z.number().int().nonnegative().nullable().optional(),
  /** The sheet's own "= ~$32/person" figure, kept rather than recomputed. */
  perPersonUsd: z.number().int().nonnegative().nullable().optional(),
  /** Operated homes are the heroes; listed homes are supporting. */
  operated: z.boolean().default(false),
  href: z.string().trim().url().max(2_000).nullable().optional(),
  imageUrl: z.string().trim().url().max(2_000).nullable().optional(),
});

export type DigestProperty = z.infer<typeof digestPropertySchema>;

export const digestSectionSchema = z.object({
  /** "AUSTIN + HILL COUNTRY, TX" */
  heading: z.string().trim().min(1).max(200),
  properties: z.array(digestPropertySchema).min(1).max(12),
});

export type DigestSection = z.infer<typeof digestSectionSchema>;

export const listingsDigestSchema = z.object({
  schema: z.literal("wander-growth.listings-digest.v1"),
  /** "Friends getaway / group travel" — the sheet's Theme column. */
  theme: z.string().trim().max(200).nullable().optional(),
  /** "Wraps up summer travel with friends…" — the sheet's rationale column. */
  rationale: z.string().trim().max(1_000).nullable().optional(),
  sections: z.array(digestSectionSchema).min(1).max(10),
});

export type ListingsDigest = z.infer<typeof listingsDigestSchema>;

// ---------------------------------------------------------------------------
// Parsing one spreadsheet row
// ---------------------------------------------------------------------------

/**
 * The sheet is machine-regular, so this is deterministic rather than a model
 * call: an all-caps line opens a region, `*` marks the operated hero, `-` marks
 * a listed home, and the rest is a pipe-delimited fact list. A model pass is
 * the right fallback for a row that drifts from the format, not the first
 * resort — parsing nine homes is not a judgement call, and a parser cannot
 * quietly invent a property that was never in the sheet.
 */

/** "$1,315/nt" → 1315. Also "~$73/person" → 73. */
function dollars(value: string | undefined): number | null {
  if (!value) return null;
  const match = /\$\s*([\d,]+)/.exec(value);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : null;
}

/** A region heading: no bullet, and not obviously a property line. */
function isHeading(line: string): boolean {
  // Trim FIRST: property bullets are indented in the sheet, so testing the
  // prefix against the raw line let an indented all-caps bullet through as a
  // region heading.
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (/^[*-]/.test(trimmed)) return false;
  line = trimmed;
  // Headings in this sheet are upper-case place names, sometimes with a state
  // code. Lower-case letters mean it is prose, not a heading.
  const letters = line.replace(/[^A-Za-z]/g, "");
  if (!letters) return false;
  return letters === letters.toUpperCase();
}

function parseProperty(line: string): DigestProperty | null {
  const operated = line.trimStart().startsWith("*");
  const body = line.replace(/^\s*[*-]\s*/, "");
  // Strip the "[OPERATED (Joel photos)]" / "[Listed]" tag.
  const untagged = body.replace(/^\[[^\]]*\]\s*/, "").trim();
  if (!untagged) return null;

  const parts = untagged.split("|").map((part) => part.trim());
  // Property names contain pipes of their own — "Treehouse 413| The Alpine |
  // 3 Bed (Stowe)", "Sunset Ridge | Luxury Wine Country Retreat" — so the name
  // is everything before the first part that reads as a FACT, not everything
  // before the first pipe. Splitting naively dropped both the rest of the name
  // and the city that trailed it.
  const isFact = (part: string) =>
    /sleeps\s*\d/i.test(part) || /\/nt/i.test(part);
  const firstFact = parts.findIndex(isFact);
  const head = (firstFact === -1 ? parts : parts.slice(0, firstFact)).join(
    " | ",
  );
  // "Wander Austin Grove (Austin)" — the trailing parenthetical is the city.
  // Property names contain parentheses of their own ("3 Bed (Stowe)"), so take
  // the LAST one rather than the first.
  const cityMatch = /^(.*)\(([^()]*)\)\s*$/.exec(head);
  const name = (cityMatch?.[1] ?? head).trim();
  const city = cityMatch?.[2]?.trim() ?? null;
  if (!name) return null;

  const sleepsPart = parts.find((part) => /sleeps/i.test(part));
  const sleepsMatch = sleepsPart ? /(\d+)/.exec(sleepsPart) : null;
  const pricePart = parts.find((part) => /\/nt/i.test(part));

  return {
    name,
    city,
    sleeps: sleepsMatch?.[1] ? Number(sleepsMatch[1]) : null,
    nightlyUsd: dollars(pricePart),
    // "$584/nt = ~$32/person" — the per-person figure is after the "=".
    perPersonUsd: dollars(pricePart?.split("=")[1]),
    operated,
    href: null,
    imageUrl: null,
  };
}

/**
 * Attach the row's URL block to the parsed properties.
 *
 * The links column repeats the same region headings in the same order, so the
 * two are zipped by position within each region. Deliberately positional and
 * not name-matched: the sheet's link slugs routinely disagree with the display
 * names (a home listed as "Wander Austin Bluffs" links to
 * `wander-austin-bluffs`, but "Wander Destin Palms" appears under a home named
 * "Green Reef 2"), and a name matcher would silently drop those rather than
 * carry the operator's own pairing through.
 */
function attachLinks(sections: DigestSection[], linksColumn: string): void {
  const byHeading = new Map<string, string[]>();
  let current: string | null = null;
  for (const raw of linksColumn.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^https?:\/\//i.test(line)) {
      if (current) byHeading.get(current)?.push(line);
      continue;
    }
    current = line.toUpperCase();
    if (!byHeading.has(current)) byHeading.set(current, []);
  }
  for (const section of sections) {
    const urls = byHeading.get(section.heading.toUpperCase());
    if (!urls) continue;
    section.properties.forEach((property, index) => {
      property.href = urls[index] ?? null;
    });
  }
}

/**
 * Recover a links block from a paste whose columns collapsed.
 *
 * When the tab structure is lost, the links section still follows its own copy
 * of the region headings, so the heading/URL sequence is intact even though the
 * cell boundary is gone. Keep only the lines that matter to `attachLinks`.
 */
function rebuildLinksBlock(properties: string): string {
  const lines: string[] = [];
  for (const raw of properties.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^https?:\/\/\S+$/i.test(line) || isHeading(line)) lines.push(line);
  }
  return lines.join("\n");
}

export type DigestRowInput = {
  /** The big properties cell. */
  properties: string;
  /** The links cell, when the row has one. */
  links?: string | null;
  theme?: string | null;
  rationale?: string | null;
};

/**
 * Parse one row of the planning sheet into a digest.
 *
 * Returns the digest plus anything it could not place, so the caller can show
 * the operator what was skipped instead of pretending the row parsed cleanly.
 */
export function parseDigestRow(input: DigestRowInput): {
  digest: ListingsDigest | null;
  unparsedLines: string[];
} {
  const sections: DigestSection[] = [];
  const unparsedLines: string[] = [];
  let current: DigestSection | null = null;

  // A links block that ends up in the properties cell (a paste that lost its
  // tabs, say) must not become a list of homes named after URLs. Route bare
  // URLs to the links side instead of inventing properties from them.
  const strayLinks: string[] = [];

  for (const raw of input.properties.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (/^https?:\/\/\S+$/i.test(line.trim())) {
      strayLinks.push(line.trim());
      continue;
    }
    if (isHeading(line)) {
      current = { heading: line.trim(), properties: [] };
      sections.push(current);
      continue;
    }
    const property = parseProperty(line);
    if (!property || !current) {
      unparsedLines.push(line.trim());
      continue;
    }
    current.properties.push(property);
  }

  const populated = sections.filter((section) => section.properties.length > 0);
  if (!populated.length) return { digest: null, unparsedLines };

  // Prefer the real links cell; fall back to any URLs that arrived inline with
  // the properties, rebuilt with the headings they followed.
  const linksBlock =
    input.links?.trim() ||
    (strayLinks.length ? rebuildLinksBlock(input.properties) : null);
  if (linksBlock) attachLinks(populated, linksBlock);

  return {
    digest: {
      schema: "wander-growth.listings-digest.v1",
      theme: input.theme?.trim() || null,
      rationale: input.rationale?.trim() || null,
      sections: populated,
    },
    unparsedLines,
  };
}

/**
 * Split a pasted block into the sheet's columns.
 *
 * A row copied out of Excel arrives tab-delimited, with the multi-line cells
 * wrapped in quotes. Pasted from a rendered table it arrives as loose text. Try
 * the structured read first and fall back to "the whole thing is the properties
 * cell", which still parses because the region/bullet structure survives either
 * way.
 */
export function splitPastedRow(pasted: string): DigestRowInput {
  // Trim newlines only. A plain .trim() eats LEADING TABS, and the sheet's
  // continuation rows have four empty columns before the properties cell — so
  // trimming collapsed a seven-cell row to two, missed the structured path,
  // and silently parsed the links block as if it were more properties.
  const text = pasted.replace(/\r\n/g, "\n").replace(/^\n+|\s+$/g, "");

  // Tab-delimited, honouring quoted cells that contain newlines and tabs.
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      // A doubled quote inside a quoted cell is a literal quote.
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      quoted = !quoted;
      continue;
    }
    if (char === "\t" && !quoted) {
      cells.push(cell);
      cell = "";
      continue;
    }
    cell += char;
  }
  cells.push(cell);

  if (cells.length >= 5) {
    // Date, Day, Theme, Why this date, Properties, Links, Copy
    return {
      theme: cells[2]?.trim() || null,
      rationale: cells[3]?.trim() || null,
      properties: cells[4] ?? "",
      links: cells[5] ?? null,
    };
  }
  return { properties: text, links: null };
}
