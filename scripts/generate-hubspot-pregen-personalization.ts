/**
 * Generate reviewed HubSpot personalization for one pregen prospect.
 *
 * Default is preview-only. `--apply` writes the reviewed token values to one
 * HubSpot contact, appends the draft to leads.outreach, and updates the lead's
 * current pregen URL. It never enrolls a contact or edits a sequence.
 *
 *   bun --conditions=react-server scripts/generate-hubspot-pregen-personalization.ts \
 *     --domain cascadiagetaways.com \
 *     --contact-email kristian.e.boe@gmail.com \
 *     --motion reengagement \
 *     --preview-url 'https://...' \
 *     --apply
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { eq } from "drizzle-orm";

import {
  findContactByEmail,
  updateContact,
} from "@/server/clients/hubspot.client";
import { db } from "@/server/db";
import { leadDomainTable, leadSequenceTable } from "@/server/db/leads-schema";
import {
  generatePregenHubspotDraft,
  PregenMotionSchema,
} from "@/server/services/pregen-hubspot-outreach.service";
import { hubspotPropertiesFromRenderedSteps } from "@/server/services/pregen-hubspot-copy";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function required(name: string): string {
  const value = arg(name)?.trim();
  if (!value) throw new Error(`Pass --${name} <value>`);
  return value;
}

const domain = required("domain").toLowerCase();
const contactEmail = required("contact-email").toLowerCase();
const previewUrl = new URL(required("preview-url")).toString();
const motion = PregenMotionSchema.parse(required("motion"));
const steer = arg("steer")?.trim();
const apply = process.argv.includes("--apply");

const result = await generatePregenHubspotDraft(domain, {
  motion,
  previewUrl,
  steer,
});
const contact = await findContactByEmail(contactEmail);
if (!contact) throw new Error(`HubSpot contact not found: ${contactEmail}`);

const [touch1, touch2] = result.draft.touches;
if (!touch1 || !touch2)
  throw new Error("Generator returned fewer than 2 touches");
const hubspotProperties = hubspotPropertiesFromRenderedSteps(
  result.renderedSteps,
);

const outPath = resolve(
  arg("out") ??
    `reports/private/hubspot-pregen-personalization/${result.domainId}-${contact.id}.json`,
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(
  outPath,
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      apply,
      domain,
      contactId: contact.id,
      contactEmail,
      previewUrl,
      ...result,
    },
    null,
    2,
  )}\n`,
  { mode: 0o600 },
);

if (apply) {
  await updateContact(contact.id, hubspotProperties);
  await db
    .update(leadDomainTable)
    .set({ pregenSiteUrl: previewUrl })
    .where(eq(leadDomainTable.id, result.domainId));
  await db.insert(leadSequenceTable).values({
    domainId: result.domainId,
    domain,
    contactId: null,
    status: "draft",
    angle: result.draft.angle,
    personalizedOn: [
      ...result.draft.personalizedOn,
      ...result.draft.historyUsed.map((value) => `History: ${value}`),
    ],
    steps: result.renderedSteps,
    model: result.model,
  });
}

console.log(
  JSON.stringify(
    {
      apply,
      domain,
      contactId: contact.id,
      hubspotCompanyId: result.hubspotCompanyId,
      motion,
      subject: touch1.subject,
      personalizationFacts: result.draft.personalizedOn.length,
      historyFacts: result.draft.historyUsed.length,
      touches: result.renderedSteps.length,
      outPath,
    },
    null,
    2,
  ),
);

console.log("\nTouch 1\n");
console.log(`Subject: ${touch1.subject ?? ""}\n`);
console.log(`${touch1.opening}\n\n${previewUrl}\n\n${touch1.closing}`);
