import { permanentRedirect } from "next/navigation";
export default async function HomesRedirect({
  params,
}: {
  params: Promise<{ brandSlug: string }>;
}) {
  const { brandSlug } = await params;
  permanentRedirect(`/app/performance/brands/${brandSlug}/wanderos`);
}
