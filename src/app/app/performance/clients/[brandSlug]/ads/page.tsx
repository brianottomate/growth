import type { Metadata } from "next";

import { AdStudio } from "./AdStudio";

export const metadata: Metadata = {
  title: "Ad studio · Wander Performance",
};
export const dynamic = "force-dynamic";

export default async function PerformanceBrandAdsPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ homes?: string; focus?: string }>;
}) {
  const [{ brandSlug }, { focus }] = await Promise.all([params, searchParams]);
  return (
    <AdStudio brandSlug={brandSlug} focus={focus} workspace="performance" />
  );
}
