---
id: new-client-setup
title: "New client from a URL"
kind: procedure
summary: "Set up a website as a client, step by step. Create and enrich the brand, set its mark, read its listing photos, open a campaign shell, draft ads from its homes, stop before any push."
tags: [ads, performance, onboarding, procedure]
---

# New client from a URL

Run this when the operator gives a website and asks to set the brand up, make ads for it, or onboard it. Report each step in one line as it lands. Stop before any platform push: pushing and delivery are the operator's call, made on the campaign page or by asking for them by name.

Work in this order. Each step reads before it writes, and re-running any step is safe.

## 1. Brand

1. `brandRead.list` to see whether the brand already exists (match on the website's domain). If it does, use it and skip to step 2.
2. Otherwise find the business name before creating: `researchRead` the homepage and take the name from its title or logo text (for chaletshh.com that is "Chalets Hocking Hills", not "Chalets HH"). Then `brandWrite.create` with that name and the website. Never name a brand after its domain.
3. `brandWrite.enrich` with the brandId. This reads the logo, colours, fonts and tagline. If enrichment fails, say so and continue; the mark step will have nothing to draw and should be skipped.

## 2. Mark

`brandWrite.setMark` with source `logo`. This renders the three tones every card draws. If the result note says the logo already carries the name or the logo is tiny, leave it; do not try lockups unless the operator asks.

## 3. Photos

1. `mediaLibraryRead.listingPhotos` for the brand. An empty result means the website is not a WanderOS site: say so, and offer `mediaLibraryRead.list` for whatever the library already holds.
2. Do not import the photos here. `adsWrite.draftAdsFromHomes` in step 5 imports the heroes it needs and only those. Import separately only when the operator asks for photos without ads.

## 4. Campaign shell

`adsWrite.draftCampaign` with the brandSlug, platforms `["meta_ads"]`, landingUrl set to the website, and budget 1000 unless the operator named one. Leave `name` out: the action applies the house naming convention itself.

## 5. Ads

`adsWrite.draftAdsFromHomes` with the campaignId. Six homes unless the operator said otherwise; pass `listingUrls` from step 3 if they named homes. This writes copy, renders a card per home, has the art director judge each card, and drafts one static ad and one carousel. Read the notes back to the operator: which cards the director adjusted and why.

## 6. Hand back

Give the campaign page path (`/app/brands/<slug>/ads/<campaignId>`) and the three things left for the operator: check the cards, add an audience if broad is not right, set the platform budget and push. Do not call `adsWrite.push` or `adsWrite.setDelivery` from this playbook.
