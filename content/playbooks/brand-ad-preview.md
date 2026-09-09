---
id: brand-ad-preview
title: "An ad preview for a brand"
kind: procedure
summary: "For a brand that already exists: pick one of their homes' photos, put it on the house card, write the copy in their voice, have the art director judge it, freeze it, and keep it on the brand as a preview of what their ads will look like. No campaign involved; nothing is pushed."
tags: [ads, performance, brand, procedure]
---

# An ad preview for a brand

Run this when the operator asks what a brand's ads would look like, or clicks Design in chat on the Ad previews section of a Performance brand page. One card per run. Report each step in one line as it lands. Nothing here touches a campaign or a platform.

## 1. The brand and a photo

1. `brandRead.getMap` with the brandId: name, slug, website, whether the mark is set.
2. `mediaLibraryRead.list` for the brand's images. Prefer a photo that came from one of their listings (the title is the home's name). If the library is empty and the website is a WanderOS site, `mediaLibraryWrite.importListingPhotos` for the brand and use the first import. If there is still no photo, stop and say so; a preview needs a photo of a home.

Choose the hero of their best home: highest guest rating when the listing feed reports one, otherwise the first.

## 2. Copy in their voice

`contentMediaWrite.writeCopy` with the brandId, `templateId` `catalog-place`, `formatId` `portrait` and the photo's `sourceMediaAssetId`. Keep the returned `homeUrl` for the last step. Tell the operator the note in one line.

## 3. The art director

`contentMediaWrite.directComposition` with a spec built from step 2: the same brandId, templateId, formatId and sourceMediaAssetId; `title`, `eyebrow`, `subtitle`, `rating` from the copy; `mark` `auto`. Use what it returns (title, subtitle, focal, scrim, and a new sourceMediaAssetId if it extended the photo). If the verdict was adjust, say what changed in one line.

## 4. Freeze and keep

1. `contentMediaWrite.freezeComposition` with the corrected spec and `assetTitle` `<home name> — <brand name> ad preview`.
2. `brandWrite.addAdPreview` with the brandId, the frozen `mediaAssetId` and the `homeUrl` from step 2.

## 5. Hand back

Call `navigateWorkspace` to the `path` the last step returned (the Performance brand page) and say the card is under Ad previews, where it shows inside the Facebook and Instagram feed mocks. Offer one more home if they want a second card. Do not create a campaign or draft ads from this intent.
