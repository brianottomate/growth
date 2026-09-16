import { redirect } from "next/navigation";

/** Setup merged into the Homes tab: picking the set lives with the roster. */
export default async function PerformanceBrandSetupPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  redirect(`/app/performance/brands/${brandSlug}/homes`);
}
