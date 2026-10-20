import { CampaignByHomePage } from "@/app/app/brands/[brandSlug]/ads/_views/CampaignByHomePage";
export const dynamic = "force-dynamic";
export default async function Page(props: {
  params: Promise<{ brandSlug: string; campaignId: string }>;
  searchParams: Promise<{ home?: string }>;
}) {
  return <CampaignByHomePage {...props} workspace="performance" />;
}
