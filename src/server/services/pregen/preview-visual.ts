import "server-only";

import { eq, sql } from "drizzle-orm";

import {
  firecrawl,
  isFirecrawlConfigured,
} from "@/server/clients/firecrawl.client";
import { R2 } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import { leadDomainTable } from "@/server/db/leads-schema";

/**
 * A durable picture of the site WE built for a prospect.
 *
 * `/app/leads/[domain]` already lays its comparison out as two columns — their
 * site on the left from the ranker's Firecrawl shot, ours on the right — but the
 * right cell had no image, only a reachability badge. That made the one
 * comparison the pitch actually rests on something an operator had to open two
 * tabs to see. This captures the missing half.
 *
 * Deliberately its own service rather than a branch inside
 * `capturePregenSourceVisual`: that one is keyed to a growth-native `buildId`
 * and carries the geometry probe that feeds source-fidelity evaluation. A
 * preview capture is keyed by DOMAIN (previews may be monolith-built, with no
 * native build row at all) and needs no geometry — nothing evaluates it, a human
 * looks at it. Which is also why the receipt is this thin: no hashes, no byte
 * counts, nothing a fidelity check would want.
 *
 * Viewports match `capturePregenSourceVisual` exactly, so before and after are
 * shot at the same sizes and the comparison is honest.
 */
const CAPTURE_VIEWPORTS = [
  { name: "desktop" as const, width: 1440, height: 900, mobile: false },
  { name: "mobile" as const, width: 390, height: 844, mobile: true },
];

type Shot = {
  viewport: "desktop" | "mobile";
  screenshotUrl: string;
  screenshotKey: string;
};

export type PregenPreviewVisualReceipt = {
  version: "preview-visual/v1";
  domain: string;
  /** The tokened preview URL, as provenance for which page this shot. Not a new
   * exposure: the same value already sits in `lead_domain.pregen_site_url`. */
  previewUrl: string;
  capturedAt: string;
  /**
   * BOTH sides of the comparison, and both rehosted to R2.
   *
   * `enrichment.leadRank.screenshotUrl` cannot be the "before" here: the ranker
   * stores Firecrawl's presigned GCS URL verbatim, and those carry an `Expires`
   * roughly a week out. Every ranked domain older than that answers 400, so a
   * comparison built on it shows a broken image on the left and looks like our
   * bug. Shooting their site again alongside ours costs two more scrapes on a
   * manual action and makes the pair self-contained and permanent.
   */
  theirs: Shot[];
  ours: Shot[];
};

/** Firecrawl returns each action's screenshot as a hosted URL; take the last,
 * which is the full-page one (the first is a viewport-sized warm-up shot that
 * forces layout before the full capture). */
function findActionScreenshot(value: unknown): string | null {
  const shots = (value as { screenshots?: unknown[] } | null | undefined)
    ?.screenshots;
  if (!Array.isArray(shots)) return null;
  const urls = shots.filter(
    (shot): shot is string =>
      typeof shot === "string" && shot.startsWith("http"),
  );
  return urls.at(-1) ?? null;
}

/**
 * Capture the assigned preview for `domain` at both viewports and persist the
 * receipt under `enrichment.previewVisual`.
 *
 * Merged as jsonb rather than replaced, matching `rankLeadDomain`, so sibling
 * enrichment keys (notably `leadRank`, which holds the left-hand screenshot)
 * survive a capture.
 */
export async function capturePreviewVisual(
  domain: string,
): Promise<PregenPreviewVisualReceipt> {
  if (!isFirecrawlConfigured) {
    throw new Error("Firecrawl is not configured");
  }

  const row = await db.query.leadDomainTable.findFirst({
    where: eq(leadDomainTable.domain, domain),
    columns: { domain: true, pregenSiteUrl: true },
  });
  if (!row) {
    throw new Error(`No lead record for ${domain}`);
  }
  if (!row.pregenSiteUrl) {
    throw new Error(
      `${domain} has no assigned preview yet — nothing to capture`,
    );
  }

  const capturedAt = new Date().toISOString();

  /** Shoot one URL at both viewports and rehost each result to R2. */
  const shoot = async (url: string, label: string): Promise<Shot[]> => {
    const shots: Shot[] = [];
    for (const viewport of CAPTURE_VIEWPORTS) {
      const result = await firecrawl.scrape(url, {
        formats: ["markdown"],
        onlyMainContent: false,
        blockAds: true,
        waitFor: 4_000,
        timeout: 60_000,
        proxy: "auto",
        mobile: viewport.mobile,
        actions: [
          { type: "wait", milliseconds: 1_000 },
          {
            type: "screenshot",
            fullPage: false,
            quality: 60,
            viewport: { width: viewport.width, height: viewport.height },
          },
          {
            type: "screenshot",
            fullPage: true,
            quality: 88,
            viewport: { width: viewport.width, height: viewport.height },
          },
        ],
      });

      const screenshotUrl = findActionScreenshot(result.actions);
      if (!screenshotUrl) {
        throw new Error(
          `Firecrawl returned no ${label} ${viewport.name} screenshot`,
        );
      }

      const response = await fetch(screenshotUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(
          `Could not download ${label} ${viewport.name} screenshot (${response.status})`,
        );
      }

      const body = Buffer.from(await response.arrayBuffer());
      const contentType = response.headers.get("content-type") ?? "image/jpeg";
      const screenshotKey = R2.buildUploadKey(
        "pregen-preview",
        domain,
        `${label}-${viewport.name}-${capturedAt.replace(/[:.]/g, "-")}.${
          contentType.includes("png") ? "png" : "jpg"
        }`,
      );

      shots.push({
        viewport: viewport.name,
        screenshotUrl: await R2.putBuffer(screenshotKey, body, contentType),
        screenshotKey,
      });
    }
    return shots;
  };

  // Ours first: if their site is unreachable, we still want the half that is
  // actually ours to land rather than losing the whole capture to their outage.
  const ours = await shoot(row.pregenSiteUrl, "ours");
  const theirs = await shoot(`https://${domain}`, "theirs").catch(() => []);

  const receipt: PregenPreviewVisualReceipt = {
    version: "preview-visual/v1",
    domain,
    previewUrl: row.pregenSiteUrl,
    capturedAt,
    theirs,
    ours,
  };

  await db
    .update(leadDomainTable)
    .set({
      enrichment: sql`coalesce(${leadDomainTable.enrichment}, '{}'::jsonb) || ${JSON.stringify(
        { previewVisual: receipt },
      )}::jsonb`,
    })
    .where(eq(leadDomainTable.domain, domain));

  return receipt;
}
