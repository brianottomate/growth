---
id: client-first-campaign
title: "A client's first campaign"
kind: procedure
summary: "For a brand that already exists: read what they filed on the intake, open the campaign shell with the house name and their budget, generate starter ideas from their featured homes, and hand the operator the campaign page. Stops before any push."
tags: [ads, performance, procedure]
---

# A client's first campaign

Run this when the operator asks to start a campaign for a client that already exists, or clicks Start campaign in chat on a client row. Report each step in one line as it lands. Stop before any platform push.

## 1. Read what we know

1. `performanceRead.clientCampaignContext` with the brandId: media budget, whether they asked for every home, the homes on record and where they are. If there is no intake, say so and use the defaults below.
2. `adsRead.listCampaigns` for the brand. If a campaign already exists, use it and skip step 2.

## 2. Campaign shell

`adsWrite.draftCampaign` with the brandSlug, platforms `["meta_ads"]`, landingUrl set to the brand's website, and budget set to the intake's media budget when there is one, else 1000. Leave `name` out: the action applies the house naming convention.

## 3. Starter ideas

Read the brand's saved Ad Studio drafts first. WanderOS onboarding already prepares a static and carousel per Featured home plus a hero carousel, all unapproved. Reuse those drafts instead of generating another set. If onboarding is missing, use `adsRead.wanderOsImportStatus`, start `adsWrite.importWanderOs`, and follow it with `waitSeconds: 20` until it succeeds or fails. Do not ask the operator to press generation buttons. Attach the saved drafts to the campaign with `adsWrite.attachAdSet` only when requested, and report the count.

## 4. Hand back

Call `navigateWorkspace` to the `handoff.reviewPath` `adsWrite.draftCampaign` returned and say what is left: review and approve each idea, add an audience if broad is not right, set the platform budget, preview and push. Do not call `adsWrite.push` or `adsWrite.setDelivery`.
