import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";

import { db } from "@/server/db";
import { pregenBuildTable } from "@/server/db/leads-schema";
import {
  pregenNativeArtifactTable,
  pregenNativeBuildTable,
  pregenNativeProspectTable,
} from "@/server/db/schema";
import { pregenPreviewUrl } from "@/server/services/pregen/preview-url";

/**
 * GET /api/pregen/preview/[token]
 *
 * The artifact contract for the standalone preview renderer: token in,
 * renderable site JSON out. The token is the bearer credential; unknown and
 * revoked tokens are indistinguishable 404s (non-probing, same contract as
 * the monolith preview endpoints). The renderer never touches this database
 * directly — this route IS the boundary between growth and the preview app.
 *
 * Two token populations answer here:
 *  - growth-native prospects (the generation-quality lab): full renderable
 *    artifact — config, pages, extractedProperties.
 *  - monolith-backed prospects (the outreach/claim path), mirrored into
 *    `pregen_build` by the WanderOS webhook: metadata only. The renderer never
 *    sends these tokens; the consumer is wander.com's /os/<slug> pitch wrapper,
 *    which needs the CANONICAL previewUrl (minted by the monolith from
 *    internalDomain — deriving a label locally 404s multi-word operators) and
 *    the claim identity for its CTA.
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
    // sourceUrl feeds the preview chrome's "Compare with <their site>" link.
    columns: { id: true, domain: true, name: true, sourceUrl: true },
  });
  if (!prospect) {
    // Not a native token — try the monolith mirror. Gate on the statuses the
    // monolith itself serves previews for (GENERATING | READY); a CLAIMED or
    // FAILED prospect 404s the pitch wrapper exactly like the preview 404s.
    const build = await db.query.pregenBuildTable.findFirst({
      where: eq(pregenBuildTable.previewToken, token),
      columns: {
        websiteId: true,
        domain: true,
        businessName: true,
        sourceUrl: true,
        status: true,
        previewUrl: true,
      },
    });
    if (
      !build?.websiteId ||
      !build.previewUrl ||
      !["GENERATING", "READY"].includes(build.status ?? "")
    ) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers });
    }
    return NextResponse.json(
      {
        kind: "monolith",
        prospect: {
          domain: build.domain,
          name: build.businessName,
          sourceUrl: build.sourceUrl,
        },
        config: {
          title: build.businessName ?? build.domain,
          description: "",
        },
        previewUrl: build.previewUrl,
        claim: { websiteId: build.websiteId, token },
      },
      { headers },
    );
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
      kind: "native",
      // sourceUrl is what the renderer's chrome checks before it will say
      // "Composed from <domain>" or offer "Compare with <domain>" — it only
      // names a site we actually crawled. Omitting it here made every
      // growth-served preview fall back to the generic "your existing site".
      prospect: {
        domain: prospect.domain,
        name: prospect.name,
        sourceUrl: prospect.sourceUrl,
      },
      version: artifact.version,
      config: artifact.config,
      pages: artifact.pages,
      extractedProperties: build?.extractedProperties ?? [],
      // Null when PREGEN_PREVIEW_HOST_ZONE is unset; consumers fall back to
      // their own derivation (native labels are cosmetic, the token decides).
      previewUrl: pregenPreviewUrl({ domain: prospect.domain, previewToken: token }),
    },
    { headers },
  );
}
