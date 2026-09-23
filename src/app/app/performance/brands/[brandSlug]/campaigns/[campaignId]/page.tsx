import { CampaignView } from "@/app/app/brands/[brandSlug]/ads/_views/CampaignView";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ brandSlug: string; campaignId: string }>;
}) {
  return <CampaignView {...await params} workspace="performance" />;
}
