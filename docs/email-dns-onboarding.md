# Marketing email DNS onboarding

Growth's brand Email tab can prepare a seven-day, email-only connection link.
The operator chooses the DNS zone and marketing subdomain, then clicks
**Prepare connection link**. Preparation adopts or creates that sending domain
in Postmark and stores `emailSender.marketingDomain` in the existing brand JSONB.
It preserves the sender, reply-to, footer, transactional domain and other settings.
No migration is needed. No DNS changes or sends happen during preparation.

The client page shows live Postmark authentication status, offers Entri Connect,
and displays copyable manual records. Its configuration includes only DKIM TXT
and return-path CNAME records under the selected marketing subdomain. No website
routing, root SPF, MX, redirects or DMARC changes are included.

## Choosing the subdomain

`DEFAULT_MARKETING_SUBDOMAIN` in `src/lib/email-dns.ts` supplies the initial
suggestion (`post`). Each brand can choose `mail`, `updates`, `post`, `wander`, or
another single DNS label in its Email tab. The DNS zone is explicit, so domains
such as `brand.co.uk` and sites on separate booking subdomains work without
guessing a public suffix. Check that the chosen label is available before use.

Getting an active link again for the same domain preserves it. Explicitly replacing the link revokes the previous one. Changing
the domain does not delete the old provider domain or its DNS records. Check for
existing use before retiring a domain. Sender addresses do not switch as a side
effect of authentication: delivery must explicitly use the selected marketing
domain once its send-time checks are implemented.

## Credentials and deployment

- `POSTMARK_ACCOUNT_TOKEN`: existing account credential for domain creation,
  adoption and verification.
- `SAAS_ENTRI_APPLICATION_ID` and `SAAS_ENTRI_APPLICATION_SECRET`: reuse the
  WanderOS Entri application through Doppler/environment configuration. Only the
  short-lived, domain-and-record-bound session token reaches the browser.


Missing Entri credentials leave manual setup available. They do not simulate
success. Configure them in the deployment environment before testing automatic
connection. The Entri application must allow the exact Growth preview or
production origin. Adding that origin is a dashboard task for Nathan or another
Entri administrator. The browser URL used by the operator supplies the copied
connection link's origin, so a preview generates preview links.

References: [Entri configuration and scoped tokens](https://developers.entri.com/connect/configuration),
[Postmark domain API](https://postmarkapp.com/developer/api/domains-api).

## Authorization and verification

Preparation requires a signed-in member of the brand's current workspace and
refuses deleted or unowned brands. The public link cannot access ads, intake,
guest data, or send controls. It is a short random bearer token stored on the brand's email settings,
retrievable by authorized operators, expiring after seven days. Every request
rechecks the live brand, deletion and expiry. The page suppresses referrers and
caching. Session creation and verification require same-origin JSON POSTs.
See [client page activity](client-page-activity.md) for link lifecycle and view tracking.

An Entri completion message is not verification. **Check verification** requests
fresh checks from Postmark. DKIM uses its live `DKIMUpdateStatus`, not the
historical `DKIMVerified` latch, and pending rotation keys take precedence.
The UI calls this **authentication verified**, not **ready to send**. Brand
readiness, DMARC policy checks, opt-outs and delivery setup are separate gates.

## Wander pilot

Use the existing Wander brand's Email tab and `wander.com` as the DNS zone.
The chosen subdomain remains provisional until launch. Prepare the connection
link, then give Nathan that link and the exact origin to allow in Entri together.
He can connect automatically or install the manual records. Recheck Postmark
after DNS propagation. This PR does not activate campaigns, create brand servers,
replace Customer.io, or alter the WanderOS dashboard/backend.

Example handoff:

> Nathan — the Growth email DNS pilot is ready for Wander. Please allow this
> Growth origin in our existing Entri application, then open the email-only setup
> link. It adds the marketing subdomain's DKIM and return-path records, with a
> manual option too. Authentication won't switch senders or launch campaigns.
