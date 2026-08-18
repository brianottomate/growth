/**
 * Enrol one HubSpot contact in the pregen sequence, from Kyle's inbox.
 *
 * The app path (`leads.startPregenSequence`) needs a `leads.contact` row and a
 * built preview, which a colleague reviewing the copy has neither of. Same
 * client, same sender, minus those two conditions.
 *
 *   bun --conditions=react-server run scripts/enroll-one-contact.ts <contactId>
 */
import {
  enrollContactInSequence,
  getContactEnrollment,
} from "@/server/clients/hubspot-sequences.client";
import {
  PREGEN_SEQUENCE_ID,
  PREGEN_SEQUENCE_SENDER_EMAIL,
  PREGEN_SEQUENCE_SENDER_USER_ID,
} from "@/lib/pregen-sequence";

const CONTACT_ID = process.argv[2] ?? "242777919150"; // kyletibbitts+pregen@gmail.com

const existing = await getContactEnrollment(CONTACT_ID);
if (existing) {
  console.log("already enrolled:", JSON.stringify(existing, null, 2));
  process.exit(0);
}

const enrollment = await enrollContactInSequence({
  hubspotContactId: CONTACT_ID,
  sequenceId: PREGEN_SEQUENCE_ID,
  senderEmail: PREGEN_SEQUENCE_SENDER_EMAIL,
  userId: PREGEN_SEQUENCE_SENDER_USER_ID,
});
console.log(JSON.stringify(enrollment, null, 2));
process.exit(0);
