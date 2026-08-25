import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { r2IsPublicUrl } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import {
  pregenNativeBuildTable,
  pregenNativeEvaluationReceiptTable,
  type PregenNativeEvaluationInputRef,
  type PregenNativeEvaluationStatus,
  type PregenNativeExtractedProperty,
  type PregenNativePage,
} from "@/server/db/schema";
import { rehostedSourceHash } from "./generation/rehost-images";

// Evaluators re-judge a PERSISTED build from its own stored evidence (crawl
// corpus, extracted properties, artifact). They never re-crawl and never call
// the generation code paths, so a receipt is an independent verdict rather
// than the pipeline grading its own homework. Receipts are immutable inserts;
// rerunning appends a new receipt and readers take the newest per kind.

export type PregenEvaluationReceiptRow =
  typeof pregenNativeEvaluationReceiptTable.$inferSelect;

type LoadedBuild = {
  id: string;
  artifact: { id: string; version: number; pages: PregenNativePage[] };
  extractedProperties: PregenNativeExtractedProperty[];
  corpus: string;
  homepageMarkdown: string;
  homepageCrawlPageId: string | null;
  inputRefs: PregenNativeEvaluationInputRef[];
};

export async function runPregenEvaluations(buildId: string): Promise<{
  receipts: PregenEvaluationReceiptRow[];
}> {
  const loaded = await loadBuildEvidence(buildId);

  const [grounding, imageProvenance, fidelity] = await Promise.all([
    evaluateGrounding(loaded),
    evaluateImageProvenance(loaded),
    evaluateSourceFidelity(loaded),
  ]);

  const receipts = await db
    .insert(pregenNativeEvaluationReceiptTable)
    .values([grounding, imageProvenance, fidelity])
    .returning();

  return { receipts };
}

export async function listLatestReceiptsByKind(
  buildId: string,
): Promise<PregenEvaluationReceiptRow[]> {
  const rows = await db.query.pregenNativeEvaluationReceiptTable.findMany({
    where: eq(pregenNativeEvaluationReceiptTable.buildId, buildId),
    orderBy: [desc(pregenNativeEvaluationReceiptTable.createdAt)],
  });
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.kind)) return false;
    seen.add(row.kind);
    return true;
  });
}

async function loadBuildEvidence(buildId: string): Promise<LoadedBuild> {
  const build = await db.query.pregenNativeBuildTable.findFirst({
    where: eq(pregenNativeBuildTable.id, buildId),
    with: { artifact: true, crawlPages: true },
  });
  if (!build?.artifact) {
    throw new Error(`Build ${buildId} has no persisted artifact to evaluate`);
  }

  const homepage = build.crawlPages.find((page) => page.kind === "homepage");
  const corpusParts = build.crawlPages.map((page) =>
    [
      page.url,
      page.markdown ?? "",
      page.metadata ? JSON.stringify(page.metadata) : "",
    ].join("\n"),
  );
  for (const property of build.extractedProperties ?? []) {
    corpusParts.push(property.name, ...property.imageUrls);
  }

  return {
    id: build.id,
    artifact: {
      id: build.artifact.id,
      version: build.artifact.version,
      pages: build.artifact.pages,
    },
    extractedProperties: build.extractedProperties ?? [],
    corpus: corpusParts.join("\n").replace(/&amp;/g, "&"),
    homepageMarkdown: homepage?.markdown ?? "",
    homepageCrawlPageId: homepage?.id ?? null,
    inputRefs: [
      { kind: "build", id: build.id },
      {
        kind: "artifact",
        id: build.artifact.id,
        version: String(build.artifact.version),
      },
      ...(homepage ? [{ kind: "crawl_page", id: homepage.id }] : []),
    ],
  };
}

// ---- GROUNDING (deterministic) --------------------------------------

type GroundingClaim = {
  subject: string;
  claim: string;
  value: string;
  grounded: boolean;
  severity: "hard" | "soft";
  note?: string;
};

/**
 * Re-verifies every numeric claim the artifact makes against the persisted
 * crawl corpus. Hard claims (prices, ratings, review counts, dollar strings
 * in copy) fail the receipt; soft claims (bed/bath/guest counts, often
 * legitimately derived from property names) only demand review.
 */
async function evaluateGrounding(loaded: LoadedBuild) {
  const claims: GroundingClaim[] = [];
  const { corpus } = loaded;

  for (const property of loaded.extractedProperties) {
    if (property.pricePerNight != null && !property.priceEstimated) {
      const rounded = Math.round(property.pricePerNight);
      claims.push({
        subject: property.name,
        claim: "price per night",
        value: `$${rounded}`,
        grounded:
          corpus.includes(`$${rounded}`) ||
          corpus.includes(`$${rounded.toLocaleString("en-US")}`),
        severity: "hard",
      });
    }
    if (property.overallRating != null) {
      const rating = property.overallRating;
      claims.push({
        subject: property.name,
        claim: "rating",
        value: rating.toString(),
        grounded: Number.isInteger(rating)
          ? new RegExp(
              `\\b${rating}(?:\\.0)?\\s*(?:star|/\\s*5|★|out of)`,
              "i",
            ).test(corpus) || corpus.includes(`${rating}.0`)
          : corpus.includes(rating.toString()),
        severity: "hard",
      });
    }
    if (property.totalReviews != null) {
      claims.push({
        subject: property.name,
        claim: "review count",
        value: property.totalReviews.toString(),
        grounded: new RegExp(`\\b${property.totalReviews}\\b`).test(corpus),
        severity: "hard",
      });
    }
    for (const [claim, value, pattern] of [
      [
        "bedrooms",
        property.bedrooms,
        `\\b${property.bedrooms}\\s*(?:-\\s*)?(?:bed(?:room)?s?|br)\\b`,
      ],
      [
        "bathrooms",
        property.bathrooms,
        `\\b${property.bathrooms}(?:\\.5)?\\s*(?:-\\s*)?(?:bath(?:room)?s?|ba)\\b`,
      ],
      [
        "occupancy",
        property.occupancy,
        `(?:sleeps|guests?|occupancy)\\s*:?\\s*${property.occupancy}\\b|\\b${property.occupancy}\\s*guests?\\b`,
      ],
    ] as const) {
      if (value == null) continue;
      claims.push({
        subject: property.name,
        claim,
        value: value.toString(),
        grounded: new RegExp(pattern, "i").test(corpus),
        severity: "soft",
        note: "May derive from the property name; review rather than reject.",
      });
    }
  }

  // Dollar amounts written into section copy (headlines, body text) must
  // exist verbatim on the source site.
  const copyText = collectArtifactText(loaded.artifact.pages);
  for (const match of new Set(copyText.match(/\$\d[\d,]*/g) ?? [])) {
    claims.push({
      subject: "section copy",
      claim: "dollar amount in copy",
      value: match,
      grounded: corpus.includes(match),
      severity: "hard",
    });
  }

  const ungroundedHard = claims.filter(
    (claim) => !claim.grounded && claim.severity === "hard",
  );
  const ungroundedSoft = claims.filter(
    (claim) => !claim.grounded && claim.severity === "soft",
  );
  const status: PregenNativeEvaluationStatus =
    claims.length === 0 || loaded.corpus.length === 0
      ? "needs_review"
      : ungroundedHard.length > 0
        ? "failed"
        : ungroundedSoft.length > 0
          ? "needs_review"
          : "passed";

  return {
    buildId: loaded.id,
    kind: "grounding" as const,
    status,
    evaluatorType: "deterministic" as const,
    evaluatorName: "grounding-numeric",
    evaluatorVersion: "v1",
    inputRefs: loaded.inputRefs,
    result: {
      claimCount: claims.length,
      groundedCount: claims.filter((claim) => claim.grounded).length,
      ungroundedHardCount: ungroundedHard.length,
      ungroundedSoftCount: ungroundedSoft.length,
      claims,
    },
  };
}

// ---- IMAGE PROVENANCE (deterministic) -------------------------------

/**
 * Every image the artifact renders must trace to the crawl corpus, and no
 * placeholder stub may survive to the persisted artifact.
 */
async function evaluateImageProvenance(loaded: LoadedBuild) {
  const serialized = JSON.stringify(loaded.artifact.pages);
  const placeholders =
    serialized.match(/https?:\/\/placehold\.co[^"\s]*/g) ?? [];

  const imageUrls = new Set<string>();
  walkStrings(loaded.artifact.pages, (key, value) => {
    const looksLikeImageKey = /image|photo|logo|favicon|avatar|src/i.test(key);
    const looksLikeImageUrl =
      /^https?:\/\//.test(value) &&
      (/\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(value) || looksLikeImageKey);
    if (looksLikeImageUrl && !value.includes("placehold.co")) {
      imageUrls.add(value.replace(/&amp;/g, "&"));
    }
  });

  // An image we rehosted no longer appears literally in the crawl corpus, so a
  // plain substring check would fail every build the moment rehosting landed.
  // The stored filename is sha256(sourceUrl), which makes the trace exact
  // rather than approximate: hash every URL the corpus contains and look the
  // hosted one up. Provenance stays a real check, not a widened one.
  const corpusHashes = new Set(
    (loaded.corpus.match(/https?:\/\/[^\s"']+/g) ?? []).map((url) =>
      rehostedSourceHash(url.replace(/[),.]+$/, "")),
    ),
  );
  const tracesToCorpus = (url: string): boolean => {
    if (loaded.corpus.includes(url)) return true;
    if (!r2IsPublicUrl(url)) return false;
    const filename = url.split("/").pop() ?? "";
    const hash = filename.split(".")[0] ?? "";
    return hash.length > 0 && corpusHashes.has(hash);
  };

  const unknown = [...imageUrls].filter((url) => !tracesToCorpus(url));
  const status: PregenNativeEvaluationStatus =
    placeholders.length > 0 || unknown.length > 0 ? "failed" : "passed";

  return {
    buildId: loaded.id,
    kind: "image_selection" as const,
    status,
    evaluatorType: "deterministic" as const,
    evaluatorName: "image-provenance",
    evaluatorVersion: "v1",
    inputRefs: loaded.inputRefs,
    result: {
      imageCount: imageUrls.size,
      placeholderCount: placeholders.length,
      placeholders,
      unknownProvenanceCount: unknown.length,
      unknownProvenance: unknown,
    },
  };
}

// ---- SOURCE FIDELITY (model) -----------------------------------------

const FidelityFinding = z.object({
  excerpt: z.string().describe("The exact generated text making the claim"),
  issue: z.string().describe("Why the source does not support it"),
  severity: z.enum(["minor", "major"]),
});

const FidelityVerdict = z.object({
  findings: z.array(FidelityFinding),
  summary: z
    .string()
    .describe("Two or three sentences on overall faithfulness"),
  verdict: z.enum(["faithful", "minor_issues", "fabrication"]),
});

const FIDELITY_SYSTEM = [
  "You are auditing a generated marketing website for a vacation-rental",
  "business against the ONLY permitted source: text crawled from the",
  "business's real site. Your job is to catch fabrication.",
  "",
  "Flag any generated claim the source does not support: amenities, awards,",
  "policies, place names, property names, guarantees, superlatives stated as",
  "fact ('the best on the coast'), services, or history. Generic marketing",
  "voice ('experience comfort') is fine; invented specifics are not.",
  "",
  "Judge severity: 'major' for invented facts a guest could rely on,",
  "'minor' for embellishment beyond the source's own register.",
  "Verdict: 'faithful' when nothing material is invented, 'minor_issues'",
  "for embellishment only, 'fabrication' when any major finding exists.",
].join("\n");

async function evaluateSourceFidelity(loaded: LoadedBuild) {
  const generatedText = collectArtifactText(loaded.artifact.pages).slice(
    0,
    9_000,
  );
  const sourceText = loaded.homepageMarkdown.slice(0, 24_000);

  if (!sourceText || !generatedText) {
    return {
      buildId: loaded.id,
      kind: "source_fidelity" as const,
      status: "needs_review" as const,
      evaluatorType: "model" as const,
      evaluatorName: "source-fidelity",
      evaluatorVersion: "v1",
      model: "claude-sonnet-5",
      inputRefs: loaded.inputRefs,
      result: {
        skipped: true,
        reason: !sourceText
          ? "No homepage markdown in the crawl corpus"
          : "Artifact contains no text content",
      },
    };
  }

  const { output, usage } = await generateText({
    model: anthropic("claude-sonnet-5"),
    output: Output.object({ schema: FidelityVerdict }),
    system: FIDELITY_SYSTEM,
    prompt: [
      "# Source site content (crawled homepage)",
      sourceText,
      "",
      "# Generated site text (every string the artifact renders)",
      generatedText,
    ].join("\n"),
  });

  const status: PregenNativeEvaluationStatus =
    output.verdict === "faithful"
      ? "passed"
      : output.verdict === "minor_issues"
        ? "needs_review"
        : "failed";

  return {
    buildId: loaded.id,
    kind: "source_fidelity" as const,
    status,
    evaluatorType: "model" as const,
    evaluatorName: "source-fidelity",
    evaluatorVersion: "v1",
    model: "claude-sonnet-5",
    inputRefs: loaded.inputRefs,
    result: {
      verdict: output.verdict,
      summary: output.summary,
      findings: output.findings,
      usage: {
        inputTokens: usage.inputTokens ?? null,
        outputTokens: usage.outputTokens ?? null,
      },
    },
  };
}

// ---- SHARED WALKERS ---------------------------------------------------

function collectArtifactText(pages: PregenNativePage[]): string {
  const parts: string[] = [];
  walkStrings(pages, (_key, value) => {
    if (!/^https?:\/\//.test(value) && value.trim().length > 2) {
      parts.push(value.trim());
    }
  });
  return parts.join("\n");
}

function walkStrings(
  value: unknown,
  visit: (key: string, value: string) => void,
  key = "",
): void {
  if (typeof value === "string") {
    visit(key, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkStrings(item, visit, key);
    return;
  }
  if (value && typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      walkStrings(childValue, visit, childKey);
    }
  }
}
