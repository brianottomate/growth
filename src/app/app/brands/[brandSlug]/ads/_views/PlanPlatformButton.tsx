"use client";

import { Button } from "@/components/ui/button";
import { ChannelLogo, platformLabel } from "@/components/channel-logos";
import { PLANNABLE_AD_PLATFORMS } from "@/lib/ad-platforms";
import { sendAssistantIntent } from "@/lib/assistant-events";

/**
 * One pill per platform not yet planned. A pill hands the whole step to the
 * chat: plan the platform, fill its setup from the brand's ad account,
 * tracking defaults and intake, and say what is still missing. Edit setup
 * stays the manual path; nothing reaches the platform until Push.
 */
export function PlanPlatformButton({
  brandId,
  brandName,
  campaignId,
  campaignName,
  planned,
}: {
  brandId: string;
  brandName: string;
  campaignId: string;
  campaignName: string;
  planned: string[];
}) {
  const remaining = PLANNABLE_AD_PLATFORMS.filter(
    (platform) => !planned.includes(platform),
  );
  if (remaining.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {remaining.map((platform) => (
        <Button
          key={platform}
          type="button"
          size="sm"
          shape="round"
          variant="outline"
          onClick={() =>
            sendAssistantIntent({
              type: "work_ad_campaign",
              brandId,
              brandName,
              campaignId,
              campaignName,
              focus: "platforms",
              visibleText: `Plan ${platformLabel(platform)} for “${campaignName}” and set it up: the brand's allowlisted ad account, its tracking defaults, and the budget from the intake. Tell me what is still missing before it can push.\n\nBrand ID: ${brandId}\nCampaign ID: ${campaignId}`,
            })
          }
        >
          <ChannelLogo platform={platform} className="size-4" />
          {platformLabel(platform)}
        </Button>
      ))}
    </div>
  );
}
