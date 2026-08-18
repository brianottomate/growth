import "server-only";

import { env } from "@/env";

/**
 * HubSpot sales sequences: enrol a contact, and ask whether one is already in
 * flight.
 *
 * Sequences are the only part of this motion HubSpot will not let us author.
 * There is no create endpoint for a sequence or a sales template, so the copy
 * lives in the UI (see `scripts/ensure-hubspot-pregen-company-properties.ts` for
 * the token surface it reads). What the API does give us is enrolment, which is
 * the part worth having in Growth: the refusals that decide whether a lead is
 * safe to send to live here, not in a rep's head.
 *
 * A sequence sends from the connected inbox of the user who enrols, so
 * `senderEmail` is not cosmetic. It decides whose mailbox and whose reputation
 * carries the send, and HubSpot rejects an address that is not connected.
 */

const BASE = "https://api.hubapi.com/automation/sequences/2026-03";

/**
 * "Pre-gen site sequence" (309640366), authored by Kyle 2026-08-18 and owned by
 * him. One automated email on day 1, then FINISH_ENROLLMENT.
 *
 * It replaces the four-touch 309570935, which stays in HubSpot unenrolled. Only
 * two tokens vary per recipient: the contact's first name, and the company's
 * `growth_pregen_preview_url` behind the "See your preview" link. The rest of
 * the copy is fixed, so the generated `growth_pregen_touch_*` properties this
 * repo still writes are not read by this sequence.
 *
 * `PREGEN_SEQUENCE_STEPS` is the shape Growth renders on the lead page (see
 * `src/lib/pregen-blast-template.ts`). HubSpot exposes no readable body for a
 * sales template, so that copy cannot be derived from the API and is kept in
 * step with this id by hand. `scripts/check-pregen-sequence.ts` compares the two
 * and is the thing that notices when someone edits the sequence in the UI.
 */
export const PREGEN_SEQUENCE_ID = "309640366";

/** Email steps in the sequence above; FINISH_ENROLLMENT is not counted. */
export const PREGEN_SEQUENCE_STEPS = 1;

export const isHubspotSequencesConfigured = !!env.HUBSPOT_ACCESS_TOKEN_OPERATED;

export type SequenceEnrollment = {
  id: string;
  toEmail: string;
  enrolledAt: string;
  updatedAt: string;
  sequenceId: string;
  sequenceName: string;
  enrolledBy: string;
  enrolledByEmail: string;
};

async function call<T>(
  path: string,
  init?: RequestInit,
): Promise<{
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
}> {
  const token = env.HUBSPOT_ACCESS_TOKEN_OPERATED;
  if (!token)
    throw new Error("HUBSPOT_ACCESS_TOKEN_OPERATED is not configured");
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;
  return {
    ok: response.ok,
    status: response.status,
    data: response.ok ? (parsed as T) : null,
    error: response.ok
      ? null
      : ((parsed as { message?: string } | null)?.message ??
        `HubSpot ${response.status}`),
  };
}

export type Sequence = {
  id: string;
  name: string;
  userId: string;
  steps: Array<{
    id: string;
    stepOrder: number;
    delayMillis: number;
    /** "EMAIL", "FINISH_ENROLLMENT", task types. */
    actionType: string;
    emailPattern?: { id: string; templateId: string };
  }>;
};

/**
 * One sequence, with its steps.
 *
 * `userId` is a required query param and is the HubSpot user whose view of the
 * sequence library answers: a sequence not shared with them 404s even though it
 * exists. Steps carry only a `templateId`, never the body, which is why the copy
 * Growth displays cannot be sourced from here.
 */
export async function getSequence(input: {
  sequenceId: string;
  hubspotUserId: string | number;
}): Promise<Sequence | null> {
  const result = await call<Sequence>(
    `/${encodeURIComponent(input.sequenceId)}?userId=${encodeURIComponent(String(input.hubspotUserId))}`,
  );
  if (result.status === 404) return null;
  if (!result.ok) throw new Error(`Sequence lookup failed: ${result.error}`);
  return result.data;
}

/**
 * The enrolment a contact is currently in, or null.
 *
 * This is the duplicate guard, and it is worth calling on every enrolment
 * attempt rather than trusting our own ledger: a rep can enrol from the HubSpot
 * UI at any time and Growth would never hear about it.
 */
export async function getContactEnrollment(
  hubspotContactId: string,
): Promise<SequenceEnrollment | null> {
  const result = await call<SequenceEnrollment>(
    `/enrollments/contact/${encodeURIComponent(hubspotContactId)}`,
  );
  // 404 is the ordinary "not enrolled" answer, not a failure.
  if (result.status === 404) return null;
  if (!result.ok) throw new Error(`Enrollment lookup failed: ${result.error}`);
  return result.data?.id ? result.data : null;
}

export async function enrollContactInSequence(input: {
  hubspotContactId: string;
  sequenceId: string;
  /** Must be a mailbox connected to the portal; it becomes the From address. */
  senderEmail: string;
}): Promise<SequenceEnrollment> {
  const result = await call<SequenceEnrollment>("/enrollments", {
    method: "POST",
    body: JSON.stringify({
      contactId: input.hubspotContactId,
      sequenceId: input.sequenceId,
      senderEmail: input.senderEmail,
    }),
  });
  if (!result.ok || !result.data) {
    throw new Error(`Enrollment failed: ${result.error}`);
  }
  return result.data;
}
