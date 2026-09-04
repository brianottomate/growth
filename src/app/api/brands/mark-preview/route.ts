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
  iconFrom: z.enum(["logo", "favicon"]).optional(),
  text: z.string().max(60).optional(),
  /** Absent = the brand's heading font; "" = the house font. */
  fontFamily: z.string().max(80).optional(),
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
    fontFamily: params.has("fontFamily") ? params.get("fontFamily")! : undefined,
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
    return NextResponse.json({ error: "No access to this brand" }, { status: 403 });
  }

  try {
    const png = await previewBrandMark({
      brandId: parsed.data.brandId,
      tone: parsed.data.tone,
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
