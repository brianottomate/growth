/**
 * Publish an already reviewed pregen draft to one HubSpot contact.
 *
 * The input stays private and is expected to contain:
 * {
 *   "domain": "example.com",
 *   "contactEmail": "test@example.com",
 *   "previewUrl": "https://...",
 *   "draft": { ...PregenHubspotDraftSchema }
 * }
 *
 * Preview-only unless `--apply` is present. Applying updates the contact
 * properties and Growth review record. It never enrolls or sends.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { outreachLinkFor } from "@/lib/pregen-urls";
import {
  findContactByEmail,
  updateContact,
} from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import {
  leadContactTable,
  leadDomainTable,
  leadSequenceTable,
} from "@/server/db/leads-schema";
import { PregenHubspotDraftSchema } from "@/server/services/pregen-hubspot-outreach.service";
import { hubspotPropertiesFromRenderedSteps } from "@/server/services/pregen-hubspot-copy";

const ReviewFileSchema = z.object({
  domain: z.string().trim().min(1),
  contactEmail: z.email(),
  previewUrl: z.url(),
  model: z.string().trim().min(1).default("operator-reviewed"),
  draft: PregenHubspotDraftSchema,
});

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const file = arg("file")?.trim();
if (!file) throw new Error("Pass --file <private reviewed JSON>");
const review = ReviewFileSchema.parse(
  JSON.parse(readFileSync(resolve(file), "utf8")),
);
const apply = process.argv.includes("--apply");
const domain = review.domain.toLowerCase();
const contactEmail = review.contactEmail.toLowerCase();

const domainRow = await db.query.leadDomainTable.findFirst({
  where: eq(leadDomainTable.domain, domain),
});
if (!domainRow) throw new Error(`Lead domain not found: ${domain}`);

const hubspotContact = await findContactByEmail(contactEmail);
if (!hubspotContact) {
  throw new Error(`HubSpot contact not found: ${contactEmail}`);
}

const dbContact = await db.query.leadContactTable.findFirst({
  where: and(
    eq(leadContactTable.domainId, domainRow.id),
    eq(leadContactTable.email, contactEmail),
  ),
});

// Same link the generator renders: the wander.com wrapper, attributed. A
// reviewed draft applied by hand should not go out pointing somewhere else.
const outreachLink = outreachLinkFor(review.previewUrl, domain);
const renderedSteps = review.draft.touches.map((touch, index) => ({
  subject: touch.subject,
  body:
    index === 0
      ? `${touch.opening}\n\n${outreachLink}\n\n${touch.closing}`
      : `${touch.opening}\n\n${touch.closing}`,
  delayDays: touch.delayDays,
}));
const properties = hubspotPropertiesFromRenderedSteps(renderedSteps);

if (apply) {
  await updateContact(hubspotContact.id, properties);
  await db
    .update(leadDomainTable)
    .set({ pregenSiteUrl: review.previewUrl })
    .where(eq(leadDomainTable.id, domainRow.id));
  await db.insert(leadSequenceTable).values({
    domainId: domainRow.id,
    domain,
    contactId: dbContact?.id ?? null,
    status: "approved",
    angle: review.draft.angle,
    personalizedOn: [
      ...review.draft.personalizedOn,
      ...review.draft.historyUsed.map((value) => `History: ${value}`),
    ],
    steps: renderedSteps,
    model: review.model,
  });
}

console.log(
  JSON.stringify(
    {
      apply,
      domain,
      contactId: hubspotContact.id,
      motion: review.draft.motion,
      propertyNames: Object.keys(properties),
      touches: renderedSteps.length,
      enrollmentCreated: false,
    },
    null,
    2,
  ),
);
