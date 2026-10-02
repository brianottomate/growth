import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { homeTable, mediaAssetTable } from "@/server/db/schema";
import { getPitchWorkspace } from "@/server/services/pitch-workspace.service";
import { loadPerformanceBrand } from "../_data";
import { PitchEditor } from "./PitchEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pitch workspace · Wander Performance" };
export default async function PitchWorkspace({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  const { session, org, brand, deskBrand } =
    await loadPerformanceBrand(brandSlug);
  if (!session) redirect("/signin");
  if (!org || !brand) notFound();
  const [pitch, homes, media] = await Promise.all([
    getPitchWorkspace(org.id, brand.id),
    db.query.homeTable.findMany({
      where: and(eq(homeTable.brandId, brand.id), isNull(homeTable.deletedAt)),
      columns: { name: true, urlKey: true, heroSourceUrl: true },
      limit: 100,
    }),
    db.query.mediaAssetTable.findMany({
      where: and(
        eq(mediaAssetTable.brandId, brand.id),
        eq(mediaAssetTable.status, "ready"),
        eq(mediaAssetTable.kind, "image"),
      ),
      columns: { id: true, title: true, url: true },
      limit: 60,
    }),
  ]);
  return (
    <PitchEditor
      key={brand.id}
      brand={pitch}
      pitchUrl={deskBrand?.pitchUrl ?? null}
      homes={homes}
      media={media}
    />
  );
}
