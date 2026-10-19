import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";

import { parseInspirationToken } from "@/lib/inbound-email";
import { R2 } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import {
  brandTable,
  channelTable,
  platformPostTable,
  type PlatformPostInsert,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";
import {
  extractNewsletterIndex,
  type NewsletterIndex,
} from "@/server/services/content-analysis.service";

// Competitor-newsletter pipeline. We subscribe to a competitor's newsletter
// using a per-brand inbound address — `inspo+<brandIdOrSlug>@<receiving domain>`
// — so the binding is created up front: the address token names the reference
// brand the issue belongs to. A forwarded issue lands on the Resend inbound
// webhook → we parse the token → look up the brand → store the issue as a
// `platform_post` (newsletter / broadcast) hung off that brand, with the
// rendered HTML body archived to R2 and a best-effort "inspiration" extraction
// on metadata. Mirrors the F5Bot pipeline (see f5bot.service.ts): AI-first,
// best-effort, and watching-mode safe — an unmatched email is logged, never
// thrown, so we can point real competitors at it and watch what lands.

// ---- Inspiration extraction --------------------------------------------------

export type InspirationExtract = NewsletterIndex;

/** Best-effort structured read of a forwarded newsletter issue. */
export async function extractInspiration(input: {
  subject: string;
  text: string | null;
  html: string | null;
}): Promise<InspirationExtract> {
  return extractNewsletterIndex(input);
}

// ---- Ingest (match → archive body → extract → persist) -----------------------

export interface InspirationIngestResult {
  matched: boolean;
  brandId?: string;
  brandName?: string;
  inserted: boolean;
  reason?: "no-token" | "no-brand" | "dupe" | "stored";
}

/**
 * Full ingest for one forwarded competitor-newsletter email. Idempotent on the
 * Resend email id (dedup per brand). Best-effort throughout: Blob archival and
 * the inspiration extraction each fail soft so the issue is still captured.
 */
export async function ingestInspirationEmail(email: {
  id: string;
  recipients: string[];
  from?: string | null;
  subject: string;
  text: string | null;
  html: string | null;
  receivedAt?: string | null;
}): Promise<InspirationIngestResult> {
  const token = parseInspirationToken(email.recipients);
  console.log(
    `[inspiration] email ${email.id} "${email.subject}" from=${email.from ?? "?"} token=${token ?? "(none)"}`,
  );
  if (!token) return { matched: false, inserted: false, reason: "no-token" };

  const [brand] = await db
    .select({ id: brandTable.id, name: brandTable.name })
    .from(brandTable)
    .where(or(eq(brandTable.id, token), eq(brandTable.slug, token)))
    .limit(1);

  if (!brand) {
    console.log(
      `[inspiration] no brand for token "${token}" — ignored (watching mode)`,
    );
    return { matched: false, inserted: false, reason: "no-brand" };
  }

  // Idempotent: dedup on (brand, Resend email id).
  const [existing] = await db
    .select({ id: platformPostTable.id })
    .from(platformPostTable)
    .where(
      and(
        eq(platformPostTable.brandId, brand.id),
        eq(platformPostTable.externalId, email.id),
      ),
    )
    .limit(1);
  if (existing) {
    console.log(`[inspiration] ${email.id} already ingested for ${brand.name}`);
    return {
      matched: true,
      brandId: brand.id,
      brandName: brand.name,
      inserted: false,
      reason: "dupe",
    };
  }

  const receivedAt = email.receivedAt ? new Date(email.receivedAt) : new Date();

  // Hang the issue off the brand's newsletter channel if one's been provisioned
  // (brand.trackNewsletter). Optional — scraped peers can run channelId null.
  const [channel] = await db
    .select({ id: channelTable.id })
    .from(channelTable)
    .where(
      and(
        eq(channelTable.brandId, brand.id),
        eq(channelTable.kind, "newsletter"),
        isNull(channelTable.deletedAt),
      ),
    )
    .limit(1);

  // Archive the rendered body to R2 (the inspiration artifact). Best-effort:
  // without storage we still capture the issue's metadata/extraction.
  let externalUrl: string | undefined;
  const body = email.html ?? email.text ?? "";
  if (body) {
    try {
      const key = R2.buildUploadKey(
        "newsletters",
        brand.id,
        `${email.id}.html`,
      );
      externalUrl = await R2.putBuffer(
        key,
        Buffer.from(body, "utf-8"),
        "text/html; charset=utf-8",
      );
    } catch (err) {
      console.error(
        `[inspiration] R2 upload failed for ${email.id} (storing without body):`,
        err,
      );
    }
  }

  // Best-effort inspiration extraction for the card / future surfacing.
  let inspiration: InspirationExtract | undefined;
  try {
    inspiration = await extractInspiration({
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  } catch (err) {
    console.error(`[inspiration] extraction failed for ${email.id}:`, err);
  }

  const insert: PlatformPostInsert = {
    id: createId("pp"),
    brandId: brand.id,
    channelId: channel?.id,
    platform: "newsletter",
    username: email.from ?? undefined,
    source: "scraped",
    status: "published",
    format: "newsletter.broadcast",
    archetype: "article",
    text: inspiration?.subject ?? email.subject,
    provider: "email_forward",
    externalId: email.id,
    externalUrl,
    externalKind: "broadcast",
    publishedAt: receivedAt,
    scrapedAt: new Date(),
    metadata: {
      from: email.from ?? null,
      ingestSource: "email_forward",
      inspiration,
    },
  };

  await db.insert(platformPostTable).values(insert);
  console.log(
    `[inspiration] stored issue for ${brand.name} (${brand.id}): "${insert.text}"${externalUrl ? " (body archived)" : ""}`,
  );

  return {
    matched: true,
    brandId: brand.id,
    brandName: brand.name,
    inserted: true,
    reason: "stored",
  };
}
