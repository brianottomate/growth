import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, memberTable } from "@/server/db/schema";
import { previewBrandMark } from "@/server/services/brand-mark.service";

export const dynamic = "force-dynamic";

const query = z.object({
  brandId: z.string().min(1),
  source: z.enum(["logo", "favicon", "lockup"]),
  tone: z.enum(["color", "white", "dark"]).default("color"),
  iconAssetId: z.string().optional(),
  iconFrom: z.enum(["logo", "favicon", "logo-icon"]).optional(),
  text: z.string().max(60).optional(),
  /** Absent = the brand's heading font; "" = the house font. */
  fontFamily: z.string().max(80).optional(),
  fontWeight: z.coerce
    .number()
    .pipe(
      z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]),
    )
    .optional(),
  letterSpacing: z.coerce.number().min(-0.05).max(0.3).optional(),
  iconScale: z.coerce.number().min(0.7).max(1.4).optional(),
  iconShift: z.coerce.number().min(-0.3).max(0.3).optional(),
  gapScale: z.coerce.number().min(0.6).max(1.6).optional(),
});

/** The lockup editor's live preview. Renders one tone, stores nothing. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  const parsed = query.safeParse({
    brandId: params.get("brandId"),
    source: params.get("source"),
    tone: params.get("tone") || "color",
    iconAssetId: params.get("iconAssetId") || undefined,
    iconFrom: params.get("iconFrom") || undefined,
    text: params.get("text") || undefined,
    fontFamily: params.has("fontFamily")
      ? params.get("fontFamily")!
      : undefined,
    fontWeight: params.get("fontWeight") || undefined,
    letterSpacing: params.get("letterSpacing") || undefined,
    iconScale: params.get("iconScale") || undefined,
    iconShift: params.get("iconShift") || undefined,
    gapScale: params.get("gapScale") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid mark" }, { status: 400 });
  }

  const brand = await db.query.brandTable.findFirst({
    where: eq(brandTable.id, parsed.data.brandId),
    columns: { organizationId: true },
  });
  const member = brand?.organizationId
    ? await db.query.memberTable.findFirst({
        where: and(
          eq(memberTable.userId, session.user.id),
          eq(memberTable.organizationId, brand.organizationId),
        ),
        columns: { id: true },
      })
    : null;
  if (!member) {
    return NextResponse.json(
      { error: "No access to this brand" },
      { status: 403 },
    );
  }

  try {
    const { iconScale, iconShift, gapScale } = parsed.data;
    const png = await previewBrandMark({
      brandId: parsed.data.brandId,
      tone: parsed.data.tone,
      tuning:
        iconScale !== undefined ||
        iconShift !== undefined ||
        gapScale !== undefined
          ? {
              iconScale: iconScale ?? 1,
              iconShift: iconShift ?? 0,
              gapScale: gapScale ?? 1,
              note: "",
            }
          : null,
      recipe: {
        source: parsed.data.source,
        iconAssetId: parsed.data.iconAssetId ?? null,
        iconFrom: parsed.data.iconFrom ?? null,
        text: parsed.data.text ?? null,
        // "" from the editor means the house font; undefined means the brand's.
        fontFamily:
          parsed.data.fontFamily === undefined
            ? undefined
            : parsed.data.fontFamily || null,
        fontWeight: parsed.data.fontWeight ?? null,
        letterSpacing: parsed.data.letterSpacing ?? null,
      },
    });
    return new NextResponse(new Uint8Array(png), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not render" },
      { status: 422 },
    );
  }
}
