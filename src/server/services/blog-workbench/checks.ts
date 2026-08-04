import { z } from "zod";

import type {
  ContentBriefGroundingContext,
  ContentBriefInput,
} from "./contract";

// Deterministic post-generation checks. Each produces a receipt row the
// workbench renders verbatim; none of them mutate the article. Statuses
// follow the pregen convention: hard violations fail, judgment calls ask
// for review.

export type CheckStatus = "passed" | "failed" | "needs_review";

export type CheckReceipt = {
  id: string;
  name: string;
  status: CheckStatus;
  summary: string;
  rows: Array<{ label: string; detail: string; ok: boolean }>;
};

export type GeneratedArticle = {
  metaTitle: string;
  metaDescription: string;
  sections: Array<{ heading: string; markdown: string }>;
};

export function runDeterministicChecks(
  article: GeneratedArticle,
  brief: ContentBriefInput,
  context: ContentBriefGroundingContext,
): CheckReceipt[] {
  return [
    checkOutlineCoverage(article, brief),
    checkNumericGrounding(article, brief, context),
    checkLinkProvenance(article, context),
    checkVoiceBans(article),
    checkEntityCoverage(article, brief),
    checkMetadataGate(article, brief),
  ];
}

function articleText(article: GeneratedArticle): string {
  return article.sections
    .map((section) => `${section.heading}\n${section.markdown}`)
    .join("\n");
}

// One section per outline heading, in order.
function checkOutlineCoverage(
  article: GeneratedArticle,
  brief: ContentBriefInput,
): CheckReceipt {
  const rows = brief.outline.map((outlineSection, index) => {
    const generated = article.sections[index];
    const ok = generated?.heading.trim() === outlineSection.heading.trim();
    return {
      label: `${index + 1}. ${outlineSection.heading}`,
      detail: generated
        ? ok
          ? "matched in position"
          : `generated heading: "${generated.heading}"`
        : "no section generated at this position",
      ok,
    };
  });
  const extra = article.sections.length - brief.outline.length;
  if (extra > 0) {
    rows.push({
      label: "extra sections",
      detail: `${extra} sections beyond the outline`,
      ok: false,
    });
  }
  const allOk = rows.every((row) => row.ok);
  return {
    id: "outline-coverage",
    name: "Outline coverage",
    status: allOk ? "passed" : "needs_review",
    summary: `${rows.filter((row) => row.ok).length}/${rows.length} outline positions matched`,
    rows,
  };
}

// Every number in the article must appear in the brief or the grounding
// context. Dollar amounts are hard failures; bare numbers ask for review
// (they are often ordinals or list positions).
function checkNumericGrounding(
  article: GeneratedArticle,
  brief: ContentBriefInput,
  context: ContentBriefGroundingContext,
): CheckReceipt {
  const permitted = `${JSON.stringify(brief)}\n${JSON.stringify(context)}`;
  const text = articleText(article);

  const dollarAmounts = [...new Set(text.match(/\$\d[\d,]*(?:\.\d+)?/g) ?? [])];
  const bareNumbers = [
    ...new Set(
      (text.match(/\b\d{1,3}(?:,\d{3})*(?:\.\d+)?\b/g) ?? []).filter(
        (token) => !dollarAmounts.some((amount) => amount.includes(token)),
      ),
    ),
  ];

  const rows = [
    ...dollarAmounts.map((amount) => ({
      label: amount,
      detail: permitted.includes(amount)
        ? "traces to brief or grounding"
        : "NOT in brief or grounding (hard violation)",
      ok: permitted.includes(amount),
    })),
    ...bareNumbers.map((token) => ({
      label: token,
      detail: permitted.includes(token)
        ? "traces to brief or grounding"
        : "not found in brief or grounding",
      ok: permitted.includes(token),
    })),
  ];

  const dollarViolations = dollarAmounts.filter(
    (amount) => !permitted.includes(amount),
  );
  const softViolations = bareNumbers.filter(
    (token) => !permitted.includes(token),
  );

  return {
    id: "numeric-grounding",
    name: "Numeric grounding",
    status:
      dollarViolations.length > 0
        ? "failed"
        : softViolations.length > 0
          ? "needs_review"
          : "passed",
    summary: `${rows.filter((row) => row.ok).length}/${rows.length} numbers trace to permitted sources`,
    rows,
  };
}

// Every link must be a property href from the grounding context.
function checkLinkProvenance(
  article: GeneratedArticle,
  context: ContentBriefGroundingContext,
): CheckReceipt {
  const text = articleText(article);
  const hrefs = [
    ...new Set(
      [
        ...text.matchAll(/href="([^"]+)"/g),
        ...text.matchAll(/\]\(([^)\s]+)\)/g),
      ].map((match) => match[1] ?? ""),
    ),
  ].filter(Boolean);

  const permitted = new Set(context.properties.map((p) => p.href));
  const rows = hrefs.map((href) => ({
    label: href,
    detail: permitted.has(href)
      ? "a real property href from the grounding context"
      : "not a grounding-context property href",
    ok: permitted.has(href),
  }));

  return {
    id: "link-provenance",
    name: "Link provenance",
    status: rows.every((row) => row.ok) ? "passed" : "failed",
    summary:
      hrefs.length === 0
        ? "article contains no links"
        : `${rows.filter((row) => row.ok).length}/${rows.length} links trace to grounding properties`,
    rows,
  };
}

// A cheap lexical screen for the monolith voice rules: em dashes and the
// hard-banned cliché list. The model evaluator judges the subtler patterns.
const BANNED_PHRASES = [
  "your home away from home",
  "unforgettable experience",
  "unparalleled luxury",
  "nestled in the heart of",
  "hidden gem",
  "escape the ordinary",
  "where memories are made",
  "a stay like no other",
  "the ultimate getaway",
  "world-class",
  "breathtaking scenery",
  "state-of-the-art",
  "top-notch",
  "second to none",
  "one-of-a-kind",
  "elevate your experience",
  "discover the magic",
  "experience the difference",
  "explore the possibilities",
  "immerse yourself",
  "indulge in luxury",
  "unlock the potential",
  "take it to the next level",
  "curated for you",
  "seamless",
];

function checkVoiceBans(article: GeneratedArticle): CheckReceipt {
  const text = articleText(article).toLowerCase();
  const rows: CheckReceipt["rows"] = [];

  const emDashCount = (articleText(article).match(/—/g) ?? []).length;
  rows.push({
    label: "em dashes",
    detail:
      emDashCount === 0 ? "none in generated copy" : `${emDashCount} found`,
    ok: emDashCount === 0,
  });

  for (const phrase of BANNED_PHRASES) {
    if (text.includes(phrase)) {
      rows.push({ label: phrase, detail: "banned phrase present", ok: false });
    }
  }

  const violations = rows.filter((row) => !row.ok);
  return {
    id: "voice-bans",
    name: "Voice bans (lexical)",
    status: violations.length === 0 ? "passed" : "needs_review",
    summary:
      violations.length === 0
        ? "no em dashes, no hard-banned clichés"
        : `${violations.length} lexical voice violations`,
    rows,
  };
}

function checkEntityCoverage(
  article: GeneratedArticle,
  brief: ContentBriefInput,
): CheckReceipt {
  const text = articleText(article).toLowerCase();
  const rows = brief.entitiesToCover.map((entity) => ({
    label: entity,
    detail: text.includes(entity.toLowerCase()) ? "mentioned" : "not mentioned",
    ok: text.includes(entity.toLowerCase()),
  }));
  const covered = rows.filter((row) => row.ok).length;
  return {
    id: "entity-coverage",
    name: "Entity coverage",
    status: covered >= Math.ceil(rows.length * 0.6) ? "passed" : "needs_review",
    summary: `${covered}/${rows.length} brief entities mentioned`,
    rows,
  };
}

// Mirrors the numeric limits of the production velite posts collection
// (velite.config.ts): h1 <= 120, metaTitle <= 60, metaDescription <= 160.
// Drafts publish at the end of time, so compiling never lists them.
const frontmatterGate = z.object({
  h1: z.string().max(120),
  metaTitle: z.string().max(60),
  metaDescription: z.string().max(160),
  publishedAt: z.literal("9999-12-31"),
});

function checkMetadataGate(
  article: GeneratedArticle,
  brief: ContentBriefInput,
): CheckReceipt {
  const candidate = {
    h1: brief.workingTitle,
    metaTitle: article.metaTitle,
    metaDescription: article.metaDescription,
    publishedAt: "9999-12-31",
  };
  const parsed = frontmatterGate.safeParse(candidate);
  const rows = [
    {
      label: `h1 (${candidate.h1.length} chars)`,
      detail: candidate.h1,
      ok: candidate.h1.length <= 120,
    },
    {
      label: `metaTitle (${candidate.metaTitle.length} chars, limit 60)`,
      detail: candidate.metaTitle,
      ok: candidate.metaTitle.length <= 60,
    },
    {
      label: `metaDescription (${candidate.metaDescription.length} chars, limit 160)`,
      detail: candidate.metaDescription,
      ok: candidate.metaDescription.length <= 160,
    },
    {
      label: "publication gate",
      detail: "draft publishes at the end of time (9999-12-31)",
      ok: true,
    },
  ];
  return {
    id: "metadata-gate",
    name: "Metadata gate (velite limits)",
    status: parsed.success ? "passed" : "failed",
    summary: parsed.success
      ? "frontmatter satisfies the production posts schema limits"
      : "frontmatter violates the production posts schema limits",
    rows,
  };
}
