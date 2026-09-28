---
id: new-client-setup
title: "New client from a URL"
kind: procedure
summary: "Set up a website as a client, step by step. Create and enrich the brand, set its mark, feature its homes, open a campaign shell, generate starter ideas from the featured homes, stop before any push."
tags: [ads, performance, onboarding, procedure]
---

# New client from a URL

Run this when the operator gives a website and asks to set the brand up, make ads for it, or onboard it. Report each step in one line as it lands. Stop before any platform push: pushing and delivery are the operator's call, made on the campaign page or by asking for them by name.

Work in this order. Each step reads before it writes, and re-running any step is safe.

## 1. Brand

1. `brandRead.list` to see whether the brand already exists (match on the website's domain). If it does, use it and skip to step 2.
2. Otherwise find the business name before creating: `researchRead` the homepage and take the name from its title or logo text (for chaletshh.com that is "Chalets Hocking Hills", not "Chalets HH"). Then `brandWrite.create` with that name and the website. Never name a brand after its domain.
3. `brandWrite.setRelationship` with `prospect` (or `client` when the operator says they have signed). A brand left as internal shows up as one of Wander's own on the Performance desk.
4. `brandWrite.enrich` with the brandId. This reads the logo, colours, fonts and tagline. If enrichment fails, say so and continue; the mark step will have nothing to draw and should be skipped.

## 2. Story

`brandWrite.draftStory` with the brandId, unless the brand already has a story. Every headline and review for the brand reads it, so it comes before any copy. Say its "What makes it itself" line back to the operator in one line.

## 3. Mark

`brandWrite.suggestMark` with the brandId. It renders each candidate at card size, picks the one that reads best and saves its three tones, the same as Suggest on Setup. Say its reason in one line. Use `brandWrite.setMark` only when the operator names a specific mark.

## 4. Photos

1. `mediaLibraryRead.listingPhotos` for the brand. An empty result means the website is not a WanderOS site: say so, and offer `mediaLibraryRead.list` for whatever the library already holds.
2. Do not import the photos here. The ideas in step 6 draw on each featured home's own gallery.
3. Feature the homes the operator named with `performanceWrite.updateHome` (`featured: true`), one call per home, using each `homeId` from the listing read. The ideas in step 6 are made from the featured homes, so this step decides what they show. A `homeId` of null means the brand's homes are not ingested yet: ask the operator to press Refresh homes on the Setup page, then read again.
4. Set the hero with `brandWrite.update` and `heroHomeId`: the home the operator named, or else the featured home with the strongest cover photo, and say in one line which and why. Nothing sets a hero on its own, so a brand without one shows empty previews until this step.

## 5. Campaign shell

`adsWrite.draftCampaign` with the brandSlug, platforms `["meta_ads"]`, landingUrl set to the website, and budget 1000 unless the operator named one. Leave `name` out: the action applies the house naming convention itself.

## 6. Ads

`adsWrite.generateStarterIdeas` with the campaignId. It makes a static and a carousel per featured home plus a portfolio carousel, choosing photos from each home's gallery and writing the copy. Every idea lands unapproved. Say in one line how many it made; if it failed, say why.

## 7. Hand back

Give the campaign page (`handoff.reviewPath` from `adsWrite.draftCampaign`) and what is left for the operator: review and approve each idea, add an audience if broad is not right, set the platform budget, preview and push. Do not call `adsWrite.push` or `adsWrite.setDelivery` from this playbook.
