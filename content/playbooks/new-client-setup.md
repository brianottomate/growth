---
id: new-client-setup
title: "New client from a URL"
kind: procedure
summary: "Set up a website as a client, step by step. Create and enrich the brand, set its mark, import its homes and prepare personas, starter Ad Studio drafts and one standalone broadcast for human review."
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

`brandWrite.updateStory` with the brandId, unless the brand already has a story. Every headline and review for the brand reads it, so it comes before any copy. Say its "What makes it itself" line back to the operator in one line.

## 3. Mark

Read the saved mark with `brandRead.identity`. If a mark already exists, preserve it and continue; a missing recommendation reason or existing tuning notes do not mean it is incomplete. Only replace an existing mark when the operator requests a change.

If no mark exists, use `brandRead.recommendMark` with the brandId. It renders candidates and returns a recommended recipe, reason and tuning without saving. Say the recommendation in one line. When the operator has asked you to set up the brand or apply the mark, save the returned recipe, reason and tuning with `brandWrite.setMark`; otherwise discuss the recommendation first. Then use `brandRead.identity` with `inspect: true` to check the saved variants.


## 4. WanderOS onboarding

1. `adsRead.wanderOsImportStatus` with the brandId. Resolve any missing identity, story or mark first.
2. Call `adsWrite.importWanderOs` when there is no successful import, the latest run failed, or `needsPreparation` is true for an older import. Do not tell the operator to press Refresh homes or Generate ads. The import prepares homes, Featured selections, destinations, missing personas, starter Ad Studio drafts, one standalone broadcast, and catalog copy. It preserves existing selections and drafts. It does not create a newsletter series or sequence.
3. Follow `adsRead.wanderOsImportStatus` with `waitSeconds: 20` while queued/running. The worker starts immediately and can progress in the same turn. Report a short update when a step finishes. A started receipt is pending work, not completion. If the run outlasts the conversation's execution limit, give its saved workflow link and exact pending step, never imply that it finished.
4. On failure report the failed step and saved work. A retry resumes completed steps; interrupted ad generation requires reviewing saved drafts before generating again. Do not repeatedly restart an active run.
5. When succeeded, read `performanceRead.featuredHomes`. Preserve the imported Featured set unless the operator named different homes. Set `brandWrite.update` with `heroHomeId` if absent, using the strongest featured home. Do not replace a saved hero without a request.

## 5. Hand back

Give the client workspace and links to Ad Studio, Email and Catalog. State how many homes and drafts are actually saved. The first broadcast is one unscheduled, unapproved send, with no series or sequence. Humans review and shape these drafts next. A campaign shell, platform budget, approvals, push and delivery are later steps unless explicitly requested. Do not call `adsWrite.push` or `adsWrite.setDelivery` from this playbook.
