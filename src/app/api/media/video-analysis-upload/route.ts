import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSession } from "@/server/better-auth/server";
import { R2 } from "@/server/clients/r2.client";
import { db } from "@/server/db";
import { mediaVideoAnalysisTable, memberTable } from "@/server/db/schema";

/**
 * Presign a direct browser → R2 PUT for one video-analysis storyboard board
 * (PNG rendered on the operator's device). Auth mirrors the tRPC analysis
 * mutations: the caller must belong to the analysis' organization. The random
 * token keeps re-renders from colliding with (or cache-poisoning) old boards.
 */
const bodySchema = z.object({
  analysisId: z.string().min(1),
  boardIndex: z.number().int().min(0).max(50),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { analysisId, boardIndex } = bodySchema.parse(await request.json());
    const analysis = await db.query.mediaVideoAnalysisTable.findFirst({
      where: eq(mediaVideoAnalysisTable.id, analysisId),
      columns: { id: true, organizationId: true },
    });
    if (!analysis) {
      return NextResponse.json(
        { error: "Video analysis not found" },
        { status: 404 },
      );
    }

    const membership = await db.query.memberTable.findFirst({
      where: and(
        eq(memberTable.userId, session.user.id),
        eq(memberTable.organizationId, analysis.organizationId),
      ),
      columns: { id: true },
    });
    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const token = randomBytes(6).toString("base64url");
    const pathname = R2.buildAnalysisKey(
      analysis.organizationId,
      analysis.id,
      `board-${boardIndex + 1}-${token}.png`,
    );
    const uploadUrl = await R2.presignPut(pathname, "image/png");
    return NextResponse.json({
      uploadUrl,
      url: R2.publicUrl(pathname),
      pathname,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}
