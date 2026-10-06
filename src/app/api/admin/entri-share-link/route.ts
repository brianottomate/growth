import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { env } from "@/env";
import { createEntriShareLink } from "@/server/clients/entri.client";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/schema";
import { getBrandEmailDns } from "@/server/services/email-dns.service";

export const dynamic = "force-dynamic";

/** "@" for the root domain, or dot-separated labels of 1-63 characters. */
const host = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(
    /^(?:@|[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?)*)$/,
  )
  // Entri's DMARC guard is a paid feature, so DMARC is never written here.
  .refine((value) => !value.split(".").includes("_dmarc"), {
    message: "DMARC records are not accepted.",
  });
const bodySchema = z.object({
  brandSlug: z.string().min(1),
  /** Records another sender asked the client to add, relative to the root domain. */
  extraRecords: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.enum(["TXT", "CNAME"]),
          host,
          value: z.string().min(1).max(4096),
        }),
        z.object({
          type: z.literal("MX"),
          host,
          value: z.string().min(1).max(253),
          priority: z.number().int().min(0).max(65535),
        }),
      ]),
    )
    .max(10)
    .default([]),
});

/**
 * Temporary: a hosted Entri link that adds a brand's prepared Postmark records
 * plus any extra records in one DNS login. Admin token only.
 */
export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  const expected = Buffer.from(`Bearer ${env.ADMIN_TOKEN}`);
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers },
    );

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.issues },
      { status: 400, headers },
    );

  // Slugs are unique per organization only; refuse to guess between them.
  const matches = await db.query.brandTable.findMany({
    where: and(
      eq(brandTable.slug, parsed.data.brandSlug),
      isNull(brandTable.deletedAt),
    ),
    columns: { id: true, organizationId: true },
    limit: 2,
  });
  const brand = matches.length === 1 ? matches[0] : null;
  if (!brand?.organizationId)
    return NextResponse.json(
      {
        error:
          matches.length > 1 ? "Brand slug is ambiguous" : "Brand not found",
      },
      { status: matches.length > 1 ? 409 : 404, headers },
    );
  const dns = await getBrandEmailDns(brand.id, brand.organizationId);
  if (!dns)
    return NextResponse.json(
      { error: "Prepare the brand's sending domain first" },
      { status: 409, headers },
    );

  const records = [
    ...dns.status.records,
    ...parsed.data.extraRecords.map((record) => ({ ...record, ttl: 300 })),
  ];
  const share = await createEntriShareLink({
    rootDomain: dns.setup.rootDomain,
    brandId: brand.id,
    records,
  });
  return NextResponse.json(
    { link: share.link, domain: dns.setup.rootDomain, records },
    { headers },
  );
}
