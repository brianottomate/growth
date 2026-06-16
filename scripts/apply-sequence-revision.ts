/**
 * apply-sequence-revision.ts — replace a lifecycle program's steps with a
 * revised sequence (the JSON block the Export-to-Claude brief asks for). Closes
 * the round-trip: spar in Claude → paste its JSON → re-import verbatim.
 *
 *   bun --conditions react-server scripts/apply-sequence-revision.ts <programId> <jsonPath>
 *
 * JSON shape: [{ name, delayDays, subject, body }, …] in send order.
 * Steps are written as email · instantly · status=planned (revised spec, not
 * yet pushed live). Existing steps for the program are deleted first.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";

import { db } from "@/server/db";
import {
  lifecycleProgramStepTable,
  lifecycleProgramTable,
} from "@/server/db/schema";

const programId = process.argv[2];
const jsonPath = process.argv[3];
if (!programId || !jsonPath) {
  console.error("usage: apply-sequence-revision.ts <programId> <jsonPath>");
  process.exit(1);
}

type RevisionStep = {
  name: string;
  delayDays: number;
  subject: string;
  body: string;
};

const steps = JSON.parse(readFileSync(jsonPath, "utf8")) as RevisionStep[];

const program = await db.query.lifecycleProgramTable.findFirst({
  where: eq(lifecycleProgramTable.id, programId),
});
if (!program) {
  console.error(`program ${programId} not found`);
  process.exit(1);
}

await db
  .delete(lifecycleProgramStepTable)
  .where(eq(lifecycleProgramStepTable.programId, programId));

for (const [i, s] of steps.entries()) {
  await db.insert(lifecycleProgramStepTable).values({
    programId,
    name: s.name,
    channel: "email",
    status: "planned",
    system: "instantly",
    position: i,
    delayMinutes: Math.round(s.delayDays * 1440),
    subject: s.subject.trim() || null,
    body: s.body,
  });
}

await db
  .update(lifecycleProgramTable)
  .set({ targetTouchpoints: steps.length })
  .where(eq(lifecycleProgramTable.id, programId));

console.log(
  `replaced steps for ${programId} (${program.name}) → ${steps.length} steps:`,
);
for (const [i, s] of steps.entries()) {
  console.log(`  ${i + 1}. Day ${s.delayDays} — ${s.name}`);
}
process.exit(0);
