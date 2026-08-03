import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  pregenNativeArtifactTable,
  pregenNativeBuildTable,
  pregenNativeProspectTable,
} from "@/server/db/schema";

/**
 * GET /api/pregen/preview/[token]
 *
 * The artifact contract for the standalone preview renderer: token in,
 * renderable site JSON out. The token is the bearer credential; unknown and
 * revoked tokens are indistinguishable 404s (non-probing, same contract as
 * the monolith preview endpoints). The renderer never touches this database
 * directly — this route IS the boundary between growth and the preview app.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const headers = {
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  };

  if (!token) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }

  const prospect = await db.query.pregenNativeProspectTable.findFirst({
    where: eq(pregenNativeProspectTable.previewToken, token),
    columns: { id: true, domain: true, name: true },
  });
  if (!prospect) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }

  const artifact = await db.query.pregenNativeArtifactTable.findFirst({
    where: eq(pregenNativeArtifactTable.prospectId, prospect.id),
    orderBy: [desc(pregenNativeArtifactTable.createdAt)],
    columns: { buildId: true, version: true, config: true, pages: true },
  });
  if (!artifact) {
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  }

  const build = await db.query.pregenNativeBuildTable.findFirst({
    where: eq(pregenNativeBuildTable.id, artifact.buildId),
    columns: { extractedProperties: true },
  });

  return NextResponse.json(
    {
      prospect: { domain: prospect.domain, name: prospect.name },
      version: artifact.version,
      config: artifact.config,
      pages: artifact.pages,
      extractedProperties: build?.extractedProperties ?? [],
    },
    { headers },
  );
}
