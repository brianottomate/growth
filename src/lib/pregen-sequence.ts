/**
 * Which HubSpot sequence the pregen motion sends, and from whose inbox.
 *
 * Client-safe, because the lead page needs all three: the id it enrols with, the
 * link a reviewer follows to read the real copy, and the address the mail will
 * come from. Keeping them together stops the sender drifting apart between the
 * two components that offer the button.
 */

/**
 * "Pre-gen site sequence", authored and owned by Kyle. One automated email on
 * day 1, then finish. Replaces the four-touch 309570935, which stays in HubSpot
 * unenrolled.
 *
 * Only two tokens vary per recipient: the contact's first name, and the
 * company's `growth_pregen_preview_url` behind the "See your preview" link. The
 * generated `growth_pregen_touch_*` company properties this repo still writes
 * are not read by this sequence.
 */
export const PREGEN_SEQUENCE_ID = "309640366";

/** Where a human reads the copy that actually sends. */
export const PREGEN_SEQUENCE_URL = `https://app.hubspot.com/sequences/22480390/sequence/${PREGEN_SEQUENCE_ID}`;

/**
 * Kyle's connected inbox, which is the point of the motion rather than a
 * default: a sequence sends from whoever enrols, and the signature that lands
 * under the copy is his. HubSpot rejects an address it has no mailbox for, so a
 * disconnected inbox fails the enrolment loudly instead of sending unsigned.
 */
export const PREGEN_SEQUENCE_SENDER_EMAIL = "kyle@wander.com";
