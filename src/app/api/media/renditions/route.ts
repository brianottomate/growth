import { and, eq, isNull } from "drizzle-orm";
import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { env } from "@/env";
import { getSession } from "@/server/better-auth/server";
import { db } from "@/server/db";
import { brandTable, mediaAssetTable, memberTable } from "@/server/db/schema";
import {
  pendingVideoRenditions,
  renderVideoRenditions,
} from "@/server/services/video-rendition.service";

/**
 * Server ffmpeg lives only in this function (see next.config.ts
 * outputFileTracingIncludes). POST cuts one video right after its upload;
 * the cron GET sweeps videos that arrived another way or whose run died.
 */
export const maxDuration = 800;

const SWEEP_BUDGET_MS = 600_000;

function isCron(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "");
  return (
    Boolean(bearer) &&
    (bearer === process.env.CRON_SECRET || bearer === env.ADMIN_TOKEN)
  );
}

export async function GET(request: NextRequest) {
  if (!isCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  const done: { mediaId: string; status: string | null }[] = [];
  for (const mediaId of await pendingVideoRenditions(10)) {
    if (Date.now() - started > SWEEP_BUDGET_MS) break;
    const result = await renderVideoRenditions(mediaId);
    done.push({ mediaId, status: result?.status ?? null });
  }
  return NextResponse.json({ done, elapsedMs: Date.now() - started });
}

const bodySchema = z.object({
  mediaId: z.string().min(1),
  force: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { mediaId, force } = bodySchema.parse(await request.json());
  const [asset] = await db
    .select({
      id: mediaAssetTable.id,
      organizationId: brandTable.organizationId,
    })
    .from(mediaAssetTable)
    .innerJoin(brandTable, eq(mediaAssetTable.brandId, brandTable.id))
    .where(
      and(
        eq(mediaAssetTable.id, mediaId),
        eq(mediaAssetTable.kind, "video"),
        isNull(mediaAssetTable.deletedAt),
      ),
    )
    .limit(1);
  if (!asset?.organizationId) {
    return NextResponse.json({ error: "Video not found" }, { status: 404 });
  }
  const [membership] = await db
    .select({ id: memberTable.id })
    .from(memberTable)
    .where(
      and(
        eq(memberTable.userId, session.user.id),
        eq(memberTable.organizationId, asset.organizationId),
      ),
    )
    .limit(1);
  if (!membership) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  after(() => renderVideoRenditions(mediaId, { force }));
  return NextResponse.json({ mediaId, status: "processing" }, { status: 202 });
}
