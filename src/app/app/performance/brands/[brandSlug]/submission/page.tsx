import { redirect } from "next/navigation";

/** Submission lives on Overview now; old links land on its section. */
export default async function PerformanceBrandSubmissionPage({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  redirect(`/app/performance/brands/${brandSlug}#submission`);
}
