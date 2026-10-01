import { redirect } from "next/navigation";

/** Personas moved into Setup; old links land there. */
export default async function PerformanceBrandAudiencesPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  redirect(`/app/performance/brands/${brandSlug}/setup`);
}
