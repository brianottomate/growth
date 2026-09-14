/**
 * HubSpot → Customer.io (and Outreach) BDR parity.
 *
 * When a person changes `demand__bdr` on a contact in HubSpot, the guest's
 * Customer.io profile must name the same rep, or lifecycle email signs off
 * as the wrong BDR. And because both CRMs are written on every sync with
 * Outreach's owner authoritative, the Outreach prospect is moved too —
 * otherwise the next sync would put Outreach's owner straight back into the
 * picker. Outreach's own webhook ignores S2S-actor owner changes, so this
 * does not echo around.
 *
 * Called from the HubSpot webhook receiver for `contact.propertyChange`
 * events on `demand__bdr`. The loop guard lives in ./owner-parity.ts.
 */
import { eq } from "drizzle-orm";

import { updateBdrAssignment } from "@/server/clients/customerio.client";
import {
  getContactProperties,
  getOwnerById,
  updateContact,
} from "@/server/clients/hubspot.client";
import {
  isOutreachConfigured,
  searchProspectByEmail,
  updateProspect,
} from "@/server/clients/outreach.client";
import { db } from "@/server/db";
import { demandCrmLinkTable } from "@/server/db/demand-schema";

import { findDemandBdrByOwnerId } from "./bdr-assignment.service";
import { shouldMirrorDemandBdrChange } from "./owner-parity";

export interface DemandBdrChangeOutcome {
  mirrored: boolean;
  note: string;
}

export async function applyDemandBdrChange(params: {
  contactId: string;
  ownerId: string | null;
  changeSource: string | null;
}): Promise<DemandBdrChangeOutcome> {
  const { contactId, ownerId, changeSource } = params;

  if (!shouldMirrorDemandBdrChange(changeSource)) {
    return {
      mirrored: false,
      note: `classified: demand__bdr change from ${changeSource ?? "unknown"} is our own write`,
    };
  }

  // Clearing the BDR is a human act too, but Outreach never propagated an
  // owner removal either; leaving CIO's last rep in place is the parity.
  if (!ownerId) {
    return {
      mirrored: false,
      note: "classified: demand__bdr cleared; CIO assignment left in place",
    };
  }

  // The property is portal-wide, but the mirror is for guests only: a rep
  // setting DEMAND - BDR on a property-manager contact must not create a
  // Customer.io person. "Guest" = the demand sync has written this contact.
  const [link] = await db
    .select({ email: demandCrmLinkTable.email })
    .from(demandCrmLinkTable)
    .where(eq(demandCrmLinkTable.hubspotContactId, contactId))
    .limit(1);
  if (!link) {
    return {
      mirrored: false,
      note: "classified: demand__bdr change on a contact the demand sync never wrote; not mirrored",
    };
  }

  const contact = await getContactProperties(contactId, [
    "email",
    "demand__bdr",
    "demand_bdr_email",
  ]);
  const email = contact?.values.email?.trim().toLowerCase() ?? null;
  if (!contact || !email) {
    return {
      mirrored: false,
      note: "classified: demand__bdr change on a contact with no readable email",
    };
  }
  // The retry rail replays stored events; apply only what the contact says
  // now, so a stale failed event cannot roll a newer assignment back.
  if ((contact.values.demand__bdr ?? "") !== ownerId) {
    return {
      mirrored: false,
      note: `classified: stale demand__bdr event (${ownerId}); contact now reads ${contact.values.demand__bdr ?? "empty"}`,
    };
  }
  if (email.endsWith("@wander.com")) {
    return {
      mirrored: false,
      note: "classified: demand__bdr change on an internal contact",
    };
  }

  const roster = findDemandBdrByOwnerId(ownerId);
  const owner = roster ? null : await getOwnerById(ownerId);
  const bdrEmail = (roster?.email ?? owner?.email ?? "").toLowerCase();
  const bdrName =
    roster?.name ??
    [owner?.firstName, owner?.lastName].filter(Boolean).join(" ") ??
    "";
  if (!bdrEmail) {
    return {
      mirrored: false,
      note: `classified: demand__bdr owner ${ownerId} has no resolvable email`,
    };
  }

  // A rep Outreach does not know cannot be held there; the next sync would
  // overwrite the picker with Outreach's owner. Say so rather than flap.
  if (isOutreachConfigured && !roster?.outreachUserId) {
    return {
      mirrored: false,
      note: `classified: demand__bdr set to ${bdrEmail}, who has no Outreach user; Outreach owner stays authoritative — add them to DEMAND_BDR_ROSTER`,
    };
  }

  await updateBdrAssignment({
    customerEmail: email,
    bdrEmail,
    bdrName: bdrName || bdrEmail,
    // CIO's attribute keeps its historical name; it carries whichever CRM id
    // the roster knows, falling back to the HubSpot owner id.
    bdrOutreachId: roster?.outreachUserId ?? ownerId,
  });

  let outreachMoved = false;
  if (isOutreachConfigured && roster?.outreachUserId) {
    const prospect = await searchProspectByEmail(email);
    if (prospect) {
      await updateProspect(prospect.id, {
        attributes: {},
        ownerId: parseInt(roster.outreachUserId, 10),
      });
      outreachMoved = true;
    }
  }

  // Keep the sibling text property honest so lists filtering on it agree
  // with the picker. Our own write — it echoes back with an API source.
  if (contact.values.demand_bdr_email?.toLowerCase() !== bdrEmail) {
    await updateContact(contactId, { demand_bdr_email: bdrEmail });
  }

  console.log(
    `✅ [DemandParity] ${email} → ${bdrName || bdrEmail} (hubspotOwner=${ownerId}, source=${changeSource})`,
  );
  return {
    mirrored: true,
    note: `inline: demand__bdr → CIO assigned_bdr_*${outreachMoved ? " + Outreach owner" : ""} (${bdrEmail})`,
  };
}
