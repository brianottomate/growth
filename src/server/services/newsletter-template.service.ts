import { brandStorySection } from "@/server/ai/prompts/brand-story";
import {
  beginDocumentRun,
  claimDocumentRun,
  failDocumentRun,
  documentForPlatform,
  saveCreativeDocument,
} from "./creative-document.service";
import { emailCopyGuidance } from "@/lib/brand-email-style";
import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  DIGEST_TEMPLATE_KEY,
  homesMarker,
  type DigestSection,
  type ListingsDigest,
} from "@/lib/listings-digest";
import {
  COLLECTION_AMENITIES,
  GROUP_COLLECTIONS,
  newsletterTemplate,
  upcomingOccasions,
  type DraftFromTemplateInput,
} from "@/lib/newsletter-templates";
import { db } from "@/server/db";
import { brandTable, homeTable } from "@/server/db/schema";

import {
  createEmailSlot,
  ensureEmailDocument,
  EMAIL_GENERATION_MODEL,
  saveEmailDocument,
} from "./email-document.service";
import { evidenceFor } from "./featured-home-suggestions.service";
import {
  digestSectionFromBrandHomes,
  newsletterLink,
  renderEmailHeaderCard,
} from "./newsletter-homes.service";
import { contactSheet } from "./starter-ad-generation.service";

// A newsletter from a template, on request: the structure is fixed, the homes
// are picked by the model from a contact sheet of a shortlist the numbers
// chose, and the copy is written around those homes in the same call, so it
// describes what the photos show. Lands as an ordinary draft.

/** One contact sheet: the shortlist the model looks at. */
const SHORTLIST = 16;

type Candidate = {
  id: string;
  name: string;
  city: string | null;
  guests: number | null;
  bedrooms: number | null;
  amenities: string[];
  description: string | null;
  hero: string;
  /** Another exterior or view, so the header card is not the first card's photo. */
  headerPhoto: string;
  thumb: string;
  directValue: number;
  sold90: number | null;
  open60: number | null;
  reviewScore: number | null;
};

const outputSchema = z.object({
  subject: z.string().describe("Under 60 characters."),
  preheader: z.string().describe("Under 90 characters."),
  header: z.object({
    eyebrow: z.string().describe("2 to 4 words, e.g. the season or place."),
    title: z
      .string()
      .describe("The header card's headline, under 40 characters."),
    detail: z
      .string()
      .describe(
        "One short line under the headline; empty when there is no offer or detail worth it.",
      ),
  }),
  intro: z
    .array(z.string())
    .describe(
      "1 or 2 short paragraphs. The first opens with Hi {{first_name|there}},",
    ),
  middle: z
    .string()
    .describe(
      "season-ahead: one paragraph on what guests come for in this season and place. home-collection: empty.",
    ),
  closing: z.string().describe("One sentence before the button."),
  offerLine: z
    .string()
    .describe(
      "The offer as one sentence, using its wording and code exactly. Empty when no offer was given.",
    ),
  ctaLabel: z.string().describe("2 to 4 words."),
  groupTitles: z
    .array(z.string())
    .describe(
      "A short title per home group, in order; an empty string for none.",
    ),
  picks: z
    .array(
      z.object({
        photo: z.number().int().describe("The photo number on the sheet."),
        note: z
          .string()
          .describe(
            "Why this home suits the email, from what the photo and facts show. Under 140 characters.",
          ),
      }),
    )
    .describe("The homes for the email, in the order they appear."),
});

const paragraph = (text: string) =>
  `<p>${text
    .trim()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")}</p>`;

const attr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

/** Words of the angle worth matching against amenities and descriptions. */
function angleTerms(angle: string) {
  return angle
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3)
    .map((word) => word.replace(/s$/, ""));
}

function matchesAngle(home: Candidate, terms: string[]) {
  if (!terms.length) return false;
  const haystack = [home.name, home.description ?? "", ...home.amenities]
    .join(" ")
    .toLowerCase();
  return terms.some((term) => haystack.includes(term));
}

/**
 * Words that turn a fact into a claim nobody gave the model: "its own pool",
 * "still open", "every cabin". Prompt rules alone did not hold them back.
 */
const CLAIM_WORDS = /\b(own|private|exclusive|still|every|always)\b/i;

function unsupportedClaims(output: z.infer<typeof outputSchema>) {
  return [
    output.subject,
    output.preheader,
    output.header.title,
    output.header.detail,
    ...output.intro,
    output.middle,
    output.closing,
    ...output.picks.map((pick) => pick.note),
  ].flatMap((text) => {
    const sentences = text.split(/(?<=[.!?])\s+/);
    return sentences.filter((sentence) => CLAIM_WORDS.test(sentence));
  });
}

async function draftNewsletterFromTemplateUnlocked(
  input: DraftFromTemplateInput & {
    organizationId: string;
    userId: string;
    runId: string;
  },
) {
  const template = newsletterTemplate(input.template);
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.organizationId),
      isNull(brandTable.deletedAt),
    ),
  });
  if (!brand) throw new Error("Brand not found in this workspace.");
  const existing = input.platformPostId
    ? await ensureEmailDocument({
        platformPostId: input.platformPostId,
        organizationId: input.organizationId,
        userId: input.userId,
      })
    : null;
  if (existing && existing.spot.brandId !== brand.id) {
    throw new Error("The email slot belongs to a different brand.");
  }

  const rows = await db.query.homeTable.findMany({
    where: and(
      eq(homeTable.brandId, brand.id),
      eq(homeTable.source, "wanderos"),
      isNull(homeTable.deletedAt),
    ),
  });
  const withPhoto = rows.filter((row) => row.heroSourceUrl);
  if (withPhoto.length === 0)
    throw new Error(
      `${brand.name} has no homes with photos yet. Press Refresh homes on its Setup page first.`,
    );

  const evidence = new Map(
    (await evidenceFor(withPhoto.map((row) => row.externalId))).map((row) => [
      row.id_unit,
      row,
    ]),
  );
  const candidates: Candidate[] = withPhoto.map((row) => {
    const e = evidence.get(row.externalId);
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      guests: row.guests,
      bedrooms: row.bedrooms,
      amenities: row.amenities ?? [],
      description: row.description,
      hero: row.heroSourceUrl!,
      headerPhoto:
        (
          row.galleryCache?.find(
            (photo) =>
              photo.url !== row.heroSourceUrl && photo.room === "Exterior",
          ) ??
          row.galleryCache?.find((photo) => photo.url !== row.heroSourceUrl)
        )?.url ?? row.heroSourceUrl!,
      thumb:
        row.galleryCache?.find((photo) => photo.url === row.heroSourceUrl)
          ?.thumbUrl ?? row.heroSourceUrl!,
      directValue: Number(e?.direct_value ?? 0),
      sold90: e?.sold_90 == null ? null : Number(e.sold_90),
      open60: e?.open_60 == null ? null : Number(e.open_60),
      reviewScore: e?.review_score == null ? null : Number(e.review_score),
    };
  });

  // A season email sells the coming weeks, so homes with open nights lead;
  // a collection is the homes that have the trait, then the best sellers.
  const terms = angleTerms(input.angle ?? "");
  const group = GROUP_COLLECTIONS.find(
    (collection) => collection.label === input.angle?.trim(),
  );
  const amenity = input.angle?.trim().toLowerCase();
  const fits = (home: Candidate) =>
    group
      ? home.guests != null &&
        home.guests >= group.min &&
        home.guests <= group.max
      : home.amenities.some((a) => a.toLowerCase() === amenity) ||
        matchesAngle(home, terms);
  const score = (home: Candidate) =>
    input.template === "season-ahead"
      ? (home.open60 ?? 0) * 100 + home.directValue / 100
      : (fits(home) ? 1e9 : 0) + home.directValue;
  const shortlist = [...candidates]
    .sort((a, b) => score(b) - score(a))
    .slice(0, SHORTLIST);
  const count = Math.min(template.homes, shortlist.length);

  // Only what guests choose a home for; Wifi and bed linens are not a pitch.
  // Community Pool stays in so the model knows the pool is shared.
  const drawSet = new Set(
    [...COLLECTION_AMENITIES, "Community Pool"].map((a) => a.toLowerCase()),
  );
  const draws = (home: Candidate) =>
    home.amenities.filter((a) => drawSet.has(a.toLowerCase()));

  const sheet = await contactSheet({
    id: brand.id,
    name: brand.name,
    url: "",
    photos: shortlist.map((home) => ({ url: home.thumb })),
  });
  const markets = brand.markets?.markets ?? [];
  const plannedAt = input.plannedAt ?? existing?.spot.contentPost?.plannedAt;
  const sendDate = plannedAt ? new Date(plannedAt) : new Date();

  const system = [
    `You write one marketing email for ${brand.name}, a vacation rental brand, to its past guests.`,
    !brand.creativeDirection && brand.brandFingerprint?.fingerprintText?.trim()
      ? `Brand voice:\n${brand.brandFingerprint.fingerprintText.trim()}`
      : null,
    brandStorySection({
      brandName: brand.name,
      story: brand.story,
      creativeDirection: brand.creativeDirection,
    }),
    emailCopyGuidance(brand),
    input.template === "season-ahead"
      ? `Template "Season ahead": a getaway for one season or occasion. Pick ${count} homes; the first is featured large, the rest follow as a list. Write groupTitles for 2 groups (the featured home, then the rest).`
      : `Template "Home collection": ${count} homes that share one thing guests want, shown as a grid. Every pick must visibly or factually have it. Write groupTitles for 1 group.`,
    input.brief
      ? `Operator brief (honor exclusions and copy/visual direction, but verify claims against the catalog):\n${input.brief}`
      : null,
    "Pick homes by number from the contact sheet, using the photo and the facts listed for that number. Each note says what that home offers for this email, in plain words, from what you can see or what its facts say.",
    "Name amenities exactly as the facts list them, at most two per note. Never call one private, own, exclusive or not shared unless the facts say so (a Community Pool is shared). Never say when an amenity is open, heated or usable in a season.",
    "Do not generalize: no every, all, always or still about the homes or the brand. Do not mention returning guests, reviews or popularity.",
    "Claim nothing you were not given: no prices, availability, discounts, dates, events or amenities beyond the facts here. Only mention an offer when one is given, and then use its wording and code exactly. No urgency or scarcity language.",
    "Plain sentences, no Markdown, no links, no lists of the homes in the copy; the home cards carry names and links.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const content = [
    {
      type: "text",
      text: [
        `Send date: ${sendDate.toDateString()}.`,
        input.angle?.trim()
          ? `${template.angleLabel}: ${input.angle.trim()}`
          : input.template === "season-ahead"
            ? "Season or occasion: choose the one that fits the send date and the markets below."
            : "What they share: choose the strongest trait several of these homes have in common.",
        input.offer?.trim()
          ? `Offer (use exactly): ${input.offer.trim()}`
          : "Offer: none.",
        markets.length
          ? `Markets:\n${markets
              .map((market) =>
                [
                  `- ${market.label}`,
                  market.draws?.length
                    ? `draws: ${market.draws.join(", ")}`
                    : null,
                  market.seasons?.length
                    ? `seasons: ${market.seasons
                        .map((season) => `${season.name} (${season.when})`)
                        .join(", ")}`
                    : null,
                ]
                  .filter(Boolean)
                  .join("; "),
              )
              .join("\n")}`
          : null,
        `Homes on the sheet:\n${shortlist
          .map((home, index) =>
            [
              `${index + 1}. ${home.name}`,
              home.city,
              home.guests ? `sleeps ${home.guests}` : null,
              home.bedrooms ? `${home.bedrooms} bedrooms` : null,
              draws(home).length
                ? `amenities: ${draws(home).join(", ")}`
                : null,
              home.reviewScore
                ? `reviews ${home.reviewScore.toFixed(1)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          )
          .join("\n")}`,
        "Write the email now.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    { type: "file", data: sheet.image, mediaType: "image/jpeg" },
  ] as const;
  const write = (retry?: { draft: unknown; problems: string[] }) =>
    generateText({
      model: anthropic(EMAIL_GENERATION_MODEL),
      output: Output.object({
        name: "TemplateNewsletter",
        schema: outputSchema,
      }),
      system,
      messages: [
        { role: "user" as const, content: [...content] },
        ...(retry
          ? [
              {
                role: "assistant" as const,
                content: JSON.stringify(retry.draft),
              },
              {
                role: "user" as const,
                content: `These phrases claim what you were not given: ${retry.problems.join("; ")}. Return the whole email again with them rewritten plainly, keeping the same picks.`,
              },
            ]
          : []),
      ],
    }).then((result) => result.output);

  let output = await write();
  const problems = unsupportedClaims(output);
  if (problems.length) output = await write({ draft: output, problems });

  // Numbers that are on the sheet, once each, in the model's order.
  const seen = new Set<number>();
  const picks = output.picks
    .filter((pick) => pick.photo >= 1 && pick.photo <= shortlist.length)
    .filter((pick) => !seen.has(pick.photo) && seen.add(pick.photo))
    .slice(0, count)
    .map((pick) => ({ home: shortlist[pick.photo - 1]!, note: pick.note }));
  if (picks.length === 0) throw new Error("The draft picked no homes.");

  const campaign = output.subject || template.label;
  const groups =
    input.template === "season-ahead" && picks.length > 1
      ? [
          { layout: "feature" as const, picks: picks.slice(0, 1) },
          { layout: "list" as const, picks: picks.slice(1) },
        ]
      : [
          {
            layout:
              input.template === "season-ahead"
                ? ("feature" as const)
                : ("grid" as const),
            picks,
          },
        ];
  const sections: DigestSection[] = await Promise.all(
    groups.map(async (group, index) => {
      const section = await digestSectionFromBrandHomes({
        brandId: brand.id,
        orgId: input.organizationId,
        homeIds: group.picks.map((pick) => pick.home.id),
        heading: output.groupTitles[index] ?? "",
        campaign,
      });
      const notes = new Map(
        group.picks.map((pick) => [pick.home.id, pick.note]),
      );
      return {
        ...section,
        heading: output.groupTitles[index] ?? "",
        layout: group.layout,
        // Nightly rates on file go stale; the card links to the live price.
        showPrices: false,
        properties: section.properties.map((property) => ({
          ...property,
          note: property.homeId ? (notes.get(property.homeId) ?? null) : null,
        })),
      };
    }),
  );

  const lead = picks[0]!.home;
  const header = await renderEmailHeaderCard({
    brandId: brand.id,
    orgId: input.organizationId,
    userId: input.userId,
    sourceUrl: lead.headerPhoto,
    eyebrow: output.header.eyebrow,
    title: output.header.title,
    detail: output.header.detail,
  }).catch((error: unknown) => {
    console.error("[newsletter-template] header card failed", error);
    return null;
  });

  const body = [
    header
      ? `<p><img src="${attr(header.url)}" alt="${attr(output.header.title)}" data-card-source="${attr(lead.headerPhoto)}" data-card-eyebrow="${attr(output.header.eyebrow)}" data-card-title="${attr(output.header.title)}" data-card-detail="${attr(output.header.detail)}"></p>`
      : `<p><img src="${attr(lead.headerPhoto)}" alt="${attr(lead.name)}"></p>`,
    ...output.intro.map(paragraph),
    homesMarker(0),
    output.middle.trim() ? paragraph(output.middle) : null,
    sections.length > 1 ? homesMarker(1) : null,
    input.offer?.trim() && output.offerLine.trim()
      ? paragraph(output.offerLine)
      : null,
    output.closing.trim() ? paragraph(output.closing) : null,
  ]
    .filter(Boolean)
    .join("\n");

  const digest: ListingsDigest = {
    schema: "wander-growth.listings-digest.v1",
    // The layout prints a theme as a "this week" badge; a blast has none.
    theme: null,
    rationale: `${template.label} template`,
    sections,
  };
  const siteUrl = brand.emailSender?.siteUrl ?? brand.website;

  const slot = existing
    ? {
        platformPostId: existing.spot.id,
        url: `/app/newsletters/${existing.spot.id}`,
      }
    : await createEmailSlot({
        organizationId: input.organizationId,
        userId: input.userId,
        brandId: brand.id,
        title: output.subject || template.label,
        format: "newsletter.blast",
        hook: input.angle?.trim() || undefined,
        purpose: input.offer?.trim() || undefined,
        plannedAt: input.plannedAt,
      });
  await saveEmailDocument({
    platformPostId: slot.platformPostId,
    organizationId: input.organizationId,
    userId: input.userId,
    draft: {
      subject: output.subject,
      preheader: output.preheader,
      bodyMarkdown: body,
      ctaLabel: siteUrl ? output.ctaLabel : null,
      ctaUrl: siteUrl ? newsletterLink(siteUrl, campaign) : null,
      templateKey: DIGEST_TEMPLATE_KEY,
      digest,
    },
    runId: input.runId,
    note: `Drafted from the ${template.label} template`,
  });

  return {
    platformPostId: slot.platformPostId,
    url: slot.url,
    subject: output.subject,
    template: input.template,
    homes: picks.map((pick) => pick.home.name),
    headerCard: Boolean(header),
  };
}

/**
 * What the template dialog suggests for one brand: the seasons its markets
 * name, the amenities enough of its homes share to make a collection, and how
 * many homes have a photo to pick from.
 */
export async function newsletterTemplateOptions(input: {
  brandId: string;
  orgId: string;
}) {
  const brand = await db.query.brandTable.findFirst({
    where: and(
      eq(brandTable.id, input.brandId),
      eq(brandTable.organizationId, input.orgId),
      isNull(brandTable.deletedAt),
    ),
    columns: { markets: true },
  });
  if (!brand) throw new Error("Brand not found in this workspace.");
  const homes = await db.query.homeTable.findMany({
    where: and(
      eq(homeTable.brandId, input.brandId),
      eq(homeTable.source, "wanderos"),
      isNull(homeTable.deletedAt),
    ),
    columns: { heroSourceUrl: true, amenities: true, guests: true },
  });
  const counts = new Map<string, number>();
  for (const home of homes) {
    for (const amenity of new Set(home.amenities ?? [])) {
      counts.set(
        amenity.toLowerCase(),
        (counts.get(amenity.toLowerCase()) ?? 0) + 1,
      );
    }
  }
  // Enough homes to fill the grid, so the collection is real.
  const collections = [
    ...GROUP_COLLECTIONS.map((group) => ({
      label: group.label,
      homes: homes.filter(
        (home) =>
          home.guests != null &&
          home.guests >= group.min &&
          home.guests <= group.max,
      ).length,
    })),
    ...COLLECTION_AMENITIES.map((amenity) => ({
      label: amenity,
      homes: counts.get(amenity.toLowerCase()) ?? 0,
    })),
  ]
    .filter((collection) => collection.homes >= 4)
    .sort((a, b) => b.homes - a.homes);
  const seasons = [
    ...new Map(
      [
        ...(brand.markets?.markets ?? [])
          .flatMap((market) => market.seasons ?? [])
          .map((season) => ({ label: season.name, when: season.when })),
        ...upcomingOccasions(new Date()).map((label) => ({
          label,
          when: null,
        })),
      ].map((season) => [season.label.toLowerCase(), season]),
    ).values(),
  ];
  return {
    homesWithPhoto: homes.filter((home) => home.heroSourceUrl).length,
    seasons,
    collections,
  };
}

export async function draftNewsletterFromTemplate(
  input: DraftFromTemplateInput & { organizationId: string; userId: string },
) {
  const slot = input.platformPostId
    ? { platformPostId: input.platformPostId }
    : await createEmailSlot({
        ...input,
        title: input.angle || newsletterTemplate(input.template).label,
        format: "newsletter.blast",
        purpose: input.brief,
      });
  const { document, spot } = await ensureEmailDocument({
    ...input,
    platformPostId: slot.platformPostId,
  });
  if (spot.brandId !== input.brandId)
    throw new Error("The email belongs to another brand.");
  const packet = await documentForPlatform(
    slot.platformPostId,
    input.organizationId,
  );
  if (!packet) throw new Error("Document not found.");
  await saveCreativeDocument({
    ...input,
    documentId: packet.id,
    document: {
      ...packet.document,
      brief: {
        ...packet.document.brief,
        direction: input.brief ?? input.angle ?? "",
        purpose: input.offer ?? packet.document.brief.purpose,
      },
    },
  });
  const run = await beginDocumentRun({
    ...input,
    documentId: document.id,
    operation: "template",
    provider: "anthropic",
    model: "claude-sonnet-5",
    extra: { template: input, platformPostId: slot.platformPostId },
  });
  await claimDocumentRun(run.id);
  try {
    return await draftNewsletterFromTemplateUnlocked({
      ...input,
      platformPostId: slot.platformPostId,
      runId: run.id,
    });
  } catch (error) {
    await failDocumentRun(run.id, error);
    throw error;
  }
}
