import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { escapeSlackMrkdwn, postOnSlack } from "@/server/clients/slack.client";
import {
  getZernioAccountWebhookSubscription,
  getZernioLeadForm,
} from "@/server/clients/zernio.client";
import { db } from "@/server/db";
import { brandTable } from "@/server/db/brand-schema";
import { metaLeadgenLeadTable } from "@/server/db/leads-schema";

// Meta lead-form leads for Performance clients, delivered by Zernio's
// `lead.received` webhook from the client's own Facebook Page. Wander's own
// Page is served by the Graph webhook in meta-leadgen.service.ts; a client's
// lead never enters that path (no WanderOS qualification, no CAPI event, no
// inbound router): it is kept in the ledger under the client's brand and
// posted to the Performance team.

/** #radio-core-inbound, where inbound leads are worked; redirected outside prod. */
const PERFORMANCE_LEADS_CHANNEL_ID = "C0A3PMXE3MG";

export const zernioLeadReceivedSchema = z.object({
  id: z.string().min(1),
  event: z.literal("lead.received"),
  test: z.boolean().optional(),
  lead: z.object({
    id: z.string().min(1),
    leadgenId: z.string().min(1),
    formId: z.string().min(1),
    formName: z.string().nullish(),
    adId: z.string().nullish(),
    adsetId: z.string().nullish(),
    campaignId: z.string().nullish(),
    fields: z.record(z.string(), z.unknown()),
    isOrganic: z.boolean(),
    createdAt: z.string(),
  }),
  account: z.object({
    id: z.string().min(1),
    accountId: z.string().optional(),
    platform: z.string(),
    profileId: z.string().nullable(),
  }),
  timestamp: z.string(),
});
export type ZernioLeadReceived = z.infer<typeof zernioLeadReceivedSchema>;

export type ZernioLeadOutcome =
  | "stored"
  | "duplicate"
  | "unknown_profile"
  | "owner_brand";

function answerText(value: unknown): string {
  if (Array.isArray(value)) return value.map(answerText).join(", ");
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean")
    return value.toString();
  return JSON.stringify(value);
}

/**
 * One lead from a client's form. The brand is the Zernio profile's brand;
 * its relationship decides the path. A profile Growth does not know is
 * acknowledged and logged, never retried.
 */
export async function receiveZernioLead(
  payload: ZernioLeadReceived,
): Promise<ZernioLeadOutcome> {
  const { lead, account } = payload;
  const brand = account.profileId
    ? await db.query.brandTable.findFirst({
        where: and(
          eq(brandTable.zernioProfileId, account.profileId),
          isNull(brandTable.deletedAt),
        ),
        columns: {
          id: true,
          name: true,
          slug: true,
          relationship: true,
          metaPageId: true,
        },
      })
    : undefined;
  if (!brand) {
    console.warn("[zernio-lead] no brand for profile", {
      eventId: payload.id,
      profileId: account.profileId,
      leadgenId: lead.leadgenId,
    });
    return "unknown_profile";
  }
  // Wander's own leads arrive by the Page webhook and go through WanderOS
  // qualification there; this path is for the brands Wander advertises for.
  if (brand.relationship !== "client") return "owner_brand";

  // The form's questions name the answers; Zernio sends option keys.
  const form = await getZernioLeadForm(lead.formId, account.id).catch(
    (error: unknown) => {
      console.error("[zernio-lead] form unavailable", {
        formId: lead.formId,
        error,
      });
      return null;
    },
  );
  const questions = form?.questions ?? [];
  const label = (key: string) =>
    questions.find((question) => question.key === key)?.label ?? key;
  const option = (key: string, raw: string) =>
    questions
      .find((question) => question.key === key)
      ?.options?.find((candidate) => candidate.key === raw)?.value ?? raw;
  const answers = Object.entries(lead.fields).map(([key, raw]) => ({
    key,
    label: label(key),
    value: option(key, answerText(raw)),
  }));

  const pageId =
    brand.metaPageId ??
    (await getZernioAccountWebhookSubscription(account.id).catch(() => null))
      ?.pageId ??
    "";
  const [row] = await db
    .insert(metaLeadgenLeadTable)
    .values({
      leadgenId: lead.leadgenId,
      brandId: brand.id,
      pageId,
      formId: lead.formId,
      formName: form?.name ?? lead.formName ?? null,
      adId: lead.adId ?? null,
      receivedVia: "zernio",
      leadCreatedAt: new Date(lead.createdAt),
      fieldData: answers.map((answer) => ({
        name: answer.key,
        values: [answer.value],
      })),
      email:
        answers.find((answer) => answer.key === "email")?.value.trim() || null,
    })
    .onConflictDoNothing({ target: metaLeadgenLeadTable.leadgenId })
    .returning({ id: metaLeadgenLeadTable.id });
  if (!row) return "duplicate";

  const heading = `*New ${escapeSlackMrkdwn(brand.name)} lead*${payload.test ? " (Zernio test)" : ""} · ${escapeSlackMrkdwn(form?.name ?? lead.formName ?? lead.formId)}`;
  const lines = answers.map(
    (answer) =>
      `*${escapeSlackMrkdwn(answer.label)}*: ${escapeSlackMrkdwn(answer.value || "—")}`,
  );
  const provenance = lead.isOrganic
    ? "Organic"
    : `Ad ${lead.adId ?? "?"} · campaign ${lead.campaignId ?? "?"}`;
  const posted = await postOnSlack({
    channel: PERFORMANCE_LEADS_CHANNEL_ID,
    text: `New ${brand.name} lead: ${form?.name ?? lead.formName ?? lead.formId}`,
    unfurl_links: false,
    blocks: [
      { type: "section", text: { type: "mrkdwn", text: heading } },
      { type: "section", text: { type: "mrkdwn", text: lines.join("\n") } },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${provenance} · ${new Date(lead.createdAt).toISOString()} · ${brand.slug ?? brand.id}`,
          },
        ],
      },
    ],
  });
  await db
    .update(metaLeadgenLeadTable)
    .set(
      posted.success
        ? { routedAt: new Date() }
        : { lastError: `slack: ${posted.error}` },
    )
    .where(eq(metaLeadgenLeadTable.id, row.id));
  return "stored";
}
