/**
 * Does the sequence Growth enrols into still look like the one Growth shows?
 *
 * The lead page renders `pregen-blast-template.ts`, a hand-kept transcription,
 * because HubSpot serves no readable body for a sales template. So the copy on
 * screen and the copy in the inbox are joined by nothing but discipline, and the
 * failure is silent in the worst direction: a reviewer approves what they read,
 * and something else sends.
 *
 * This cannot compare the words. What it can compare is the shape, which is what
 * actually changed the last two times: four touches became one, and the id moved.
 * A step-count match is weak evidence, but it is the only evidence available and
 * it would have caught both.
 *
 *   bun --conditions=react-server scripts/check-pregen-sequence.ts
 *   bun --conditions=react-server scripts/check-pregen-sequence.ts --as kyle@wander.com
 *   bun --conditions=react-server scripts/check-pregen-sequence.ts --id 309640366
 *
 * `--id` inspects a sequence Growth is not pointed at yet, which is the question
 * worth asking before switching: how many emails is it, and does it resolve for
 * the person who will enrol.
 *
 * Exits 1 on drift so it can gate a deploy.
 */
import {
  PREGEN_SEQUENCE_ID,
  PREGEN_SEQUENCE_STEPS,
  getSequence,
  isHubspotSequencesConfigured,
} from "@/server/clients/hubspot-sequences.client";
import { env } from "@/env";
import { blastSequenceFor } from "@/lib/pregen-blast-template";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (!isHubspotSequencesConfigured) {
  console.error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");
  process.exit(1);
}

// A sequence 404s for a user it was never shared with, so the lookup is done as
// whoever will enrol rather than as an arbitrary owner.
const asEmail = arg("as") ?? "kristian@wander.com";
const sequenceId = arg("id") ?? PREGEN_SEQUENCE_ID;
const inspecting = sequenceId !== PREGEN_SEQUENCE_ID;
const owners = await fetch("https://api.hubapi.com/crm/v3/owners?limit=200", {
  headers: { Authorization: `Bearer ${env.HUBSPOT_ACCESS_TOKEN_OPERATED!}` },
});
const { results = [] } = (await owners.json()) as {
  results?: Array<{ email?: string; userId?: number }>;
};
const owner = results.find(
  (row) => row.email?.toLowerCase() === asEmail.toLowerCase(),
);
if (!owner?.userId) {
  console.error(`No HubSpot user for ${asEmail}`);
  process.exit(1);
}

const live = await getSequence({
  sequenceId,
  hubspotUserId: owner.userId,
});

if (!live) {
  console.error(
    `Sequence ${sequenceId} does not resolve for ${asEmail}. It was deleted, or never shared with them.`,
  );
  process.exit(1);
}

const liveEmails = live.steps.filter((step) => step.actionType === "EMAIL");
const shown = blastSequenceFor({
  domain: "example.com",
  previewUrl: null,
}).length;

console.log(`sequence  ${live.name} (${live.id})`);
console.log(`as        ${asEmail} (userId ${owner.userId})`);
console.log(`live      ${liveEmails.length} email step(s)`);
console.log(`declared  ${PREGEN_SEQUENCE_STEPS}`);
console.log(`rendered  ${shown} touch(es) on the lead page`);

// A sequence Growth is not pointed at has nothing to be in step with; report
// its shape and stop rather than failing on a comparison nobody asked for.
if (inspecting) {
  console.log(
    `\nInspecting only. Growth enrols into ${PREGEN_SEQUENCE_ID}, not this one.`,
  );
  process.exit(0);
}

const problems: string[] = [];
if (liveEmails.length !== PREGEN_SEQUENCE_STEPS) {
  problems.push(
    `HubSpot has ${liveEmails.length} email step(s), PREGEN_SEQUENCE_STEPS says ${PREGEN_SEQUENCE_STEPS}`,
  );
}
if (shown !== PREGEN_SEQUENCE_STEPS) {
  problems.push(
    `the lead page renders ${shown} touch(es), PREGEN_SEQUENCE_STEPS says ${PREGEN_SEQUENCE_STEPS}`,
  );
}

if (problems.length) {
  console.error(`\nDRIFT\n  ${problems.join("\n  ")}`);
  console.error(
    "\nRe-read the sequence in HubSpot and transcribe it into src/lib/pregen-blast-template.ts before enrolling anyone.",
  );
  process.exit(1);
}

console.log("\nin step");
process.exit(0);
