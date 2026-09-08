---
id: client-first-campaign
title: "A client's first campaign"
kind: procedure
summary: "For a brand that already exists: read what they filed on the intake, open the campaign shell with the house name and their budget, draft the first ads from their homes, and hand the operator the campaign page. Stops before any push."
tags: [ads, performance, procedure]
---

# A client's first campaign

Run this when the operator asks to start a campaign for a client that already exists, or clicks Start campaign in chat on a client row. Report each step in one line as it lands. Stop before any platform push.

## 1. Read what we know

1. `performanceRead.clientCampaignContext` with the brandId: media budget, whether they asked for every home, the homes on record and where they are. If there is no intake, say so and use the defaults below.
2. `adsRead.listCampaigns` for the brand. If a campaign already exists, use it and skip step 2.

## 2. Campaign shell

`adsWrite.draftCampaign` with the brandSlug, platforms `["meta_ads"]`, landingUrl set to the brand's website, and budget set to the intake's media budget when there is one, else 1000. Leave `name` out: the action applies the house naming convention.

## 3. Ads from their homes

`adsWrite.draftAdsFromHomes` with the campaignId. If the intake named homes, pass their listing URLs as `listingUrls`; if it asked for every home, leave it out and take the default six. Read the art director's notes back to the operator in one or two lines.

## 4. Hand back

Call `navigateWorkspace` to `/app/brands/<slug>/ads/<campaignId>` and say what is left: check the cards, add an audience if broad is not right, set the platform budget and push. Do not call `adsWrite.push` or `adsWrite.setDelivery`.
