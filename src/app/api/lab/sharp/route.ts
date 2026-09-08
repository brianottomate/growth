import { NextResponse } from "next/server";
import sharp from "sharp";

import { assertLabAccess } from "@/server/lab-access";

export const dynamic = "force-dynamic";

/**
 * Does sharp actually run in this deployment? The 0.35 bump once passed every
 * local check and then 500'd on Vercel because the lambda could not dlopen
 * libvips (#113) — nothing short of executing the native lib on the target
 * proves it. A create → PNG → metadata round-trip needs no fixtures, so
 * `scripts/smoke-preview.ts` can call this on any preview.
 */
export async function GET(request: Request) {
  const denied = await assertLabAccess(request);
  if (denied) return denied;

  try {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#ff0000" },
    })
      .png()
      .toBuffer();
    const meta = await sharp(png).metadata();
    const ok = meta.format === "png" && meta.width === 8 && meta.height === 8;
    return NextResponse.json({
      ok,
      sharp: sharp.versions.sharp,
      vips: sharp.versions.vips,
      format: meta.format,
      width: meta.width,
      height: meta.height,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        sharp: sharp.versions.sharp,
        vips: sharp.versions.vips,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
