import { PlatformCampaignView } from "@/app/app/brands/[brandSlug]/ads/_views/PlatformCampaignView";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ brandSlug: string; platformCampaignId: string }>;
}) {
  return <PlatformCampaignView {...await params} workspace="performance" />;
}
