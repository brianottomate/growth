import type { Metadata } from "next";

import { AdStudio } from "@/app/app/performance/clients/[brandSlug]/ads/AdStudio";

export const metadata: Metadata = { title: "Ad studio" };
export const dynamic = "force-dynamic";

/** The Performance desk's Ad Studio, opened from the brand's own workspace. */
export default async function BrandAdStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string }>;
  searchParams: Promise<{ focus?: string }>;
}) {
  const [{ brandSlug }, { focus }] = await Promise.all([params, searchParams]);
  return <AdStudio brandSlug={brandSlug} focus={focus} workspace="brand" />;
}
