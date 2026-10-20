import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import {
  partnershipIdInput,
  partnershipListInput,
  partnershipOutput,
  partnershipSaveInput,
} from "@/lib/influencer-partnerships";
import {
  deleteInfluencerPartnership,
  listInfluencerPartnerships,
  saveInfluencerPartnership,
} from "@/server/services/influencer-partnerships.service";

export const listPartnerships = growthAction({
  description:
    "List influencer partnerships and their tagged booking links. Filter by client brand or amplifier. Links use the partnership ID for attribution. A link issue indicates that no usable link is available.",
  inputSchema: partnershipListInput,
  outputSchema: z.array(partnershipOutput),
  execute: (input, ctx) => listInfluencerPartnerships(input, ctx.orgId),
});
export const savePartnership = growthAction({
  description:
    "Create or update one influencer partnership. Creation needs an existing amplifierId and client brandId; homeId is optional, otherwise link to the client's website. Supply id and only changed fields to update; null clears optional fields. Stay dates are internal context and never constrain the promotion link. Each collaboration has its own stable ID; repeat collaborations are allowed. This generates a tagged URL but sends no email, creates no brand, and makes no reservation.",
  inputSchema: partnershipSaveInput,
  outputSchema: partnershipOutput,
  execute: (input, ctx) => saveInfluencerPartnership(input, ctx.orgId),
});
export const removePartnership = growthAction({
  description:
    "Delete one partnership from the active list, retaining its identity for historical attribution. Already copied tagged URLs still visit the booking site. Does not delete contacts, clients or homes.",
  inputSchema: partnershipIdInput,
  outputSchema: partnershipIdInput,
  execute: (input, ctx) => deleteInfluencerPartnership(input.id, ctx.orgId),
});
