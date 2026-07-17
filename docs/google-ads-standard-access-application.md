# Guide to a Google Ads API Standard Access application

> **Status (2026-07-16): this is the FUTURE playbook — do not submit this
> application yet.** It describes the *full-service tool* framing (Wander
> managing campaigns on behalf of property managers), which triggers Google's
> RMF review and requires demonstrating live product workflows that don't
> exist yet (WanderOS Google campaigns are paused; no PM-facing campaign UI).
> The application we ARE submitting now uses the lighter **internal-tool
> framing** — see
> [google-ads-standard-access-cto-signoff.md](./google-ads-standard-access-cto-signoff.md).
> Standard access granted under the internal framing carries over; when the
> WanderOS ads product ships, this document becomes the upgrade checklist.

This guide is for applying for **Standard access** to the Google Ads API from
Wander's manager account (MCC). It assumes Wander will programmatically manage
Google Ads campaigns for property managers using Wander's product.

## Why Standard access

Basic access is appropriate for internal reporting and management, but is
limited to 15,000 operations per day. Standard access removes that daily cap
and is the appropriate tier for a production integration that manages paid
media at scale for customers.

Because the product provides a service that benefits external businesses, the
application should be treated as a **full-service tool** application. Google
may require the Required Minimum Functionality (RMF) review in addition to the
developer-token review.

## Before starting

- Use the Wander MCC, not an individual property-manager account.
- Confirm the MCC has an active billing profile and at least one active,
  compliant Google Ads account.
- Confirm the Google Ads API Center already shows the existing developer token
  and its current Basic access status.
- Have the public Wander website, product login/demo environment, and the
  technical/product contacts available.
- Prepare a short product document or demo recording. It should show the real
  product workflow, not a generic API diagram.

## Product description to use

Use wording along these lines, adapting it only where it would otherwise be
inaccurate:

> Wander provides a managed direct-booking growth platform for vacation-rental
> property managers. Property managers use Wander to operate their direct
> booking sites and acquire guests. Through the Google Ads API, Wander creates,
> updates, monitors, and reports on Google Ads campaigns for participating
> property managers. Campaigns are managed from sub-accounts linked to
> Wander's MCC. Wander staff use the product to configure and optimize the
> campaigns; property managers benefit from the service without needing to
> operate the Google Ads API themselves.

Be explicit that Wander is operating campaigns **on behalf of** property
managers. Do not frame the integration as internal-only reporting if the
intended production use includes customer accounts.

## Recommended application answers

These are principles rather than a replacement for the live form; Google
changes its questions periodically.

| Form topic | Recommended answer |
| --- | --- |
| Access level | Standard access |
| Organization | Wander Inc. |
| Account type | Manager account / MCC |
| API use case | Reporting and campaign/account management, with the full-service-tool use case described above |
| Who uses the tool | Wander's authorized internal operators; the underlying service benefits participating property managers |
| Customer Google Ads accounts | Wander-managed sub-accounts linked to the Wander MCC |
| Campaign types | Only select campaign types that the product actually supports now (for example Search and Performance Max if applicable) |
| App conversion tracking / remarketing | Select only if there is a live, store-listed mobile app and a separate token/use case is genuinely needed. This approval is scoped separately from normal Google Ads API capabilities. |

Never promise self-serve customer access, bulk editing, bidding automation,
or support for campaign types that are not currently functional in the
product. The review is easier when the application precisely matches the
working product.

## Required Minimum Functionality evidence

For a full-service tool, make the RMF evidence concrete. A concise 2–4 page
document or a 3–5 minute narrated product video should cover:

1. **Account model** — Wander MCC → property-manager sub-account → campaigns.
   Explain how authorization and account linking are controlled.
2. **Campaign workflow** — a user creates or configures a campaign in Wander;
   Wander validates the inputs and sends the appropriate Google Ads API write.
3. **Management workflow** — show editing or pausing a campaign, budget, ad
   group, asset, or other genuinely supported entity, followed by the update
   reflected in Google Ads.
4. **Reporting workflow** — show performance data retrieved through the API
   and presented in a useful operational/reporting view.
5. **Safety and access controls** — identify who can make changes, how account
   access is scoped, and how changes can be audited or reversed.

Screenshots should include the actual Wander UI plus the relevant Google Ads
result where useful. Redact customer names, spend, account IDs, and tokens.
If the feature is not yet live enough to demonstrate those workflows, wait to
apply: an accurate, working demonstration is materially stronger than a
roadmap.

## Submission checklist

- [ ] Confirm the selected MCC and developer token are Wander's.
- [ ] Request Standard access in the API Center.
- [ ] Describe the product as a managed, full-service tool for property
      managers—not as an internal analytics integration.
- [ ] Attach the RMF evidence (document and/or demo link) and ensure all links
      are accessible to Google reviewers without a Wander login, or provide a
      reviewer login and clear instructions.
- [ ] Name a technical contact who can answer implementation questions and a
      business/product contact who can explain the customer workflow.
- [ ] Save a copy of every submitted answer and attachment in a secure internal
      location.

## After submission

- Monitor the email associated with the MCC and the Google Ads API Center for
  reviewer questions.
- Reply with evidence from the current product. Do not expand the claimed scope
  merely to satisfy a question.
- Keep Basic-access workloads within quota until Standard access is approved.
- If Google rejects the application, map each reviewer concern to a missing
  product capability or unclear piece of evidence, update the product/evidence,
  then resubmit.

## References

- [Google Ads API access levels](https://developers.google.com/google-ads/api/docs/access-levels)
- [Required Minimum Functionality](https://developers.google.com/google-ads/api/docs/required-minimum-functionality)
- [Apply for a developer token](https://developers.google.com/google-ads/api/docs/get-started/dev-token)
