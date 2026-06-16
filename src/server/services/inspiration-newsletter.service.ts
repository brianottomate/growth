import "server-only";

import { anthropic } from "@ai-sdk/anthropic";
import { Output, generateText } from "ai";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

import { env } from "@/env";
import { r2PutBuffer } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import {
  brandTable,
  platformPostTable,
  type PlatformPostInsert,
} from "@/server/db/schema";
import { createId } from "@/server/db/utils";

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

const EXTRACTION_MODEL = anthropic("claude-sonnet-4-6");

/**
 * Pull the brand token out of an `inspo+<token>@…` recipient. Returns null for
 * a bare `inspo@…` (no token) or when no inspo recipient is present.
 */
export function parseInspirationToken(recipients: string[]): string | null {
  const joined = recipients.join(",");
  const match = /inspo\+([^@>,\s]+)@/i.exec(joined);
  return match?.[1]?.toLowerCase() ?? null;
}

// ---- Inspiration extraction --------------------------------------------------

const InspirationSchema = z.object({
  subject: z
    .string()
    .nullable()
    .describe("The issue's subject line, cleaned of list/forwarding cruft."),
  summary: z
    .string()
    .describe("One or two sentences: what this issue is actually about."),
  themes: z
    .array(z.string())
    .describe("1–5 short topic/theme tags covered by the issue."),
  ctas: z
    .array(z.string())
    .describe(
      "Notable calls-to-action or offers, as short verbatim phrases. Empty if none.",
    ),
});

export type InspirationExtract = z.infer<typeof InspirationSchema>;

const EXTRACTION_SYSTEM = `You read a competitor's marketing newsletter and extract what is reusable as inspiration for our own growth team.

Be concise and concrete. Capture the subject line, a tight summary of the issue, the content themes it covers, and any notable calls-to-action or offers (verbatim short phrases). Ignore boilerplate: unsubscribe footers, "view in browser", address blocks, and tracking junk. If a field is genuinely absent, return an empty array (or null for subject) — do not invent.`;

/** Best-effort structured read of a forwarded newsletter issue. */
export async function extractInspiration(input: {
  subject: string;
  text: string | null;
  html: string | null;
}): Promise<InspirationExtract> {
  const body = (input.text?.trim() || input.html?.trim() || "").slice(0, 20_000);
  const { output } = await generateText({
    model: EXTRACTION_MODEL,
    system: EXTRACTION_SYSTEM,
    prompt: `Subject: ${input.subject}\n\n${body}`,
    output: Output.object({ schema: InspirationSchema }),
  });
  return output;
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
 * Resend email id (dedup per brand). Best-effort throughout: R2 archival and
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
    return { matched: true, brandId: brand.id, brandName: brand.name, inserted: false, reason: "dupe" };
  }

  const receivedAt = email.receivedAt ? new Date(email.receivedAt) : new Date();

  // Archive the rendered body to R2 (the inspiration artifact). Best-effort:
  // without storage we still capture the issue's metadata/extraction.
  let externalUrl: string | undefined;
  const body = email.html ?? email.text ?? "";
  if (body) {
    try {
      const key = [env.R2_PREFIX, "newsletters", brand.id, `${email.id}.html`]
        .filter(Boolean)
        .join("/");
      externalUrl = await r2PutBuffer(
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
    metadata: { from: email.from ?? null, ingestSource: "email_forward", inspiration },
  };

  await db.insert(platformPostTable).values(insert);
  console.log(
    `[inspiration] stored issue for ${brand.name} (${brand.id}): "${insert.text}"${externalUrl ? " (body archived)" : ""}`,
  );

  return { matched: true, brandId: brand.id, brandName: brand.name, inserted: true, reason: "stored" };
}
