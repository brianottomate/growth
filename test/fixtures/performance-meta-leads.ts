import assert from "node:assert/strict";
import { mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { z } from "zod";

const noNetwork = (): never => {
  throw new Error("No network in Performance lead acceptance");
};
globalThis.fetch = Object.assign(noNetwork, { preconnect: noNetwork });
await mock.module("server-only", () => ({}));
await mock.module("@/env", () => ({
  env: { META_LEADGEN_ROUTE_FROM: "2026-01-01T00:00:00Z" },
}));
const { metaLeadgenLeadTable } = await import("@/server/db/leads-schema");
const pg = new PGlite();
await pg.exec(`CREATE SCHEMA leads; CREATE TABLE leads.meta_leadgen_lead (
 id text PRIMARY KEY, leadgen_id text NOT NULL UNIQUE, brand_id text, page_id text NOT NULL,
 form_id text, form_name text, ad_id text, campaign_name text, received_via text NOT NULL,
 lead_created_at timestamp, field_data jsonb, email text, units integer, qualified boolean,
 capi_sent_at timestamp, routed_at timestamp, meeting_rep_email text, meeting_checked_at timestamp,
 last_error text, created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
);`);
const db = drizzle(pg, {
  schema: { metaLeadgenLeadTable },
  casing: "snake_case",
});
let zernioBrand = {
  id: "wander-brand",
  name: "Wander",
  slug: "wander",
  relationship: "internal",
  metaPageId: "101399685529192",
};
const serviceDb = new Proxy(db, {
  get(target, property, receiver) {
    if (property === "query")
      return {
        ...target.query,
        brandTable: { findFirst: async () => zernioBrand },
      };
    return Reflect.get(target, property, receiver) as unknown;
  },
});
await mock.module("@/server/db", () => ({ db: serviceDb }));
const facts = {
  audience: "operator" as const,
  minimumUnits: 1,
  email: "operator@example.com",
  firstName: "Test",
  lastName: "Operator",
  phone: null,
  pms: null,
  bookingSite: { hostname: "example.com", pathname: "/" },
  directBookingStatus: "live" as const,
  primaryInterest: "Performance ads",
  marketsToday: null,
  monthlySpend: null,
  qualificationReason: "One managed rental and a live direct site.",
};
await mock.module("@ai-sdk/anthropic", () => ({
  anthropic: () => "test-model",
}));
await mock.module("ai", () => ({
  generateText: async () => ({ output: facts }),
  Output: { object: () => ({}) },
}));
await mock.module("@/server/services/meta-lead-normalization.service", () => ({
  META_LEAD_NORMALIZATION_SYSTEM: "test",
  metaLeadNormalizationSchema: z.object({
    audience: z.enum(["operator", "guest", "unknown"]),
    minimumUnits: z.number().nullable(),
    email: z.string().nullable(),
    firstName: z.string().nullable(),
    lastName: z.string().nullable(),
    phone: z.string().nullable(),
    pms: z.string().nullable(),
    bookingSite: z
      .object({ hostname: z.string(), pathname: z.string() })
      .nullable(),
  }),
  normalizeMetaLead: async () => facts,
}));
let failCrm = false;
let crmCalls = 0;
const updates: Record<string, unknown>[] = [];
await mock.module("@/server/clients/hubspot.client", () => ({
  HUBSPOT_ACCOUNT_ID: "test",
  upsertContact: async () => {
    crmCalls++;
    if (failCrm) throw new Error("CRM unavailable");
    return { id: "contact-one" };
  },
  updateContact: async (_id: string, props: Record<string, unknown>) => {
    updates.push(props);
  },
}));
const alerts: Record<string, unknown>[] = [];
await mock.module("@/server/clients/slack.client", () => ({
  escapeSlackMrkdwn: (s: string) => s,
  postOnSlack: async (message: Record<string, unknown>) => {
    alerts.push(message);
    return { success: true };
  },
}));
await mock.module("@/server/clients/zernio.client", () => ({
  getZernioLeadForm: async () => ({
    id: "1919237109459929",
    name: "Performance beta",
    questions: [],
  }),
  getZernioAccountWebhookSubscription: noNetwork,
}));
let capiCalls = 0;
const pageId = "101399685529192";
await mock.module("@/server/clients/meta-leadgen.client", () => ({
  WANDER_PAGE_ID: pageId,
  sendQualifiedLeadEvent: async () => {
    assert.ok(updates.length > 0, "CAPI must follow CRM");
    capiCalls++;
  },
  fetchLead: noNetwork,
  fetchFormName: noNetwork,
  fetchPageAccessToken: noNetwork,
  listActiveLeadForms: noNetwork,
  listFormLeadsSince: noNetwork,
}));
await mock.module("@/server/clients/revenuehero.client", () => ({
  isRevenueHeroLookupConfigured: false,
  lookupMeetingRep: noNetwork,
}));
let osCalls = 0;
await mock.module("@/server/services/inbound-router.service", () => ({
  extractEmailDomain: () => "example.com",
  osInboundLeadRouter: async () => {
    osCalls++;
    return { contactId: "os-contact" };
  },
}));
const { recordLeadNotifications, processLead } =
  await import("@/server/services/meta-leadgen.service");
const { routePerformanceLead } =
  await import("@/server/services/performance-lead.service");
const { isPerformanceMetaForm, isQualifiedPerformanceLead } =
  await import("@/lib/performance-lead");
const formId = "1919237109459929";
const deliver = async (id: string, form = formId) => {
  await recordLeadNotifications(
    [
      {
        leadgen_id: id,
        page_id: pageId,
        form_id: form,
        created_time: 1792663200,
      },
    ],
    "zernio",
  );
  return processLead({
    leadgenId: id,
    pageToken: "",
    lead: {
      id,
      form_id: form,
      created_time: "2026-10-22T12:00:00Z",
      field_data: [],
    },
    formName: "Performance beta",
  });
};
// Exact form identity, not marketing wording, owns the Performance routing boundary.
assert.equal(isPerformanceMetaForm(formId), true);
assert.equal(isPerformanceMetaForm("1087046654230215"), false);
assert.equal(isQualifiedPerformanceLead(facts), true);
assert.equal(
  isQualifiedPerformanceLead({ ...facts, directBookingStatus: "building" }),
  false,
);
assert.equal(
  isQualifiedPerformanceLead({ ...facts, minimumUnits: null }),
  false,
);
await deliver("10001");
await deliver("10001");
assert.equal(osCalls, 0);
assert.equal(crmCalls, 1);
assert.equal(alerts.length, 1);
assert.equal(updates[0]?.hubspot_owner_id, "101168977");
assert.equal(capiCalls, 1);
assert.match(String(updates[0]?.message), /Performance beta/);
assert.equal(updates[0]?.intent_inbound_form, undefined);
// CRM failure must not release a qualification event; the ledger can retry.
failCrm = true;
const originalError = console.error;
console.error = () => {
  /* Expected failed CRM delivery; asserted through the ledger below. */
};
await deliver("10002");
console.error = originalError;
assert.equal(capiCalls, 1);
const [pending] = await db
  .select()
  .from(metaLeadgenLeadTable)
  .where(eq(metaLeadgenLeadTable.leadgenId, "10002"));
assert.equal(pending?.routedAt, null);
failCrm = false;
await deliver("10002");
assert.equal(capiCalls, 2);
// Test sends may reach the testing channel, but cannot create/reassign a contact.
const beforeTest = crmCalls;
await routePerformanceLead({ lead: facts, source: "test", test: true });
assert.equal(crmCalls, beforeTest);
assert.equal(alerts.at(-1)?.channel, "radio-slack-testing");
// A real WanderOS form still follows its own router and 10-unit threshold.
await deliver("10003", "1087046654230215");
assert.equal(osCalls, 1);
assert.equal(capiCalls, 2);
const { receiveZernioLead } =
  await import("@/server/services/zernio-lead.service");
const payload = {
  id: "event-one",
  event: "lead.received" as const,
  timestamp: "2026-10-22T12:00:00Z",
  account: {
    id: "connection-one",
    platform: "facebook",
    profileId: "wander-profile",
  },
  lead: {
    id: "zernio-one",
    leadgenId: "10004",
    formId,
    fields: { email: "operator@example.com" },
    isOrganic: false,
    createdAt: "2026-10-22T12:00:00Z",
  },
};
const beforeZernio = crmCalls;
await receiveZernioLead({ ...payload, test: true });
assert.equal(crmCalls, beforeZernio);
assert.equal(capiCalls, 2);
await receiveZernioLead(payload);
assert.equal(crmCalls, beforeZernio + 1);
assert.equal(capiCalls, 3);
await deliver("10004"); // Same Meta lead via Graph cannot deliver a second time.
assert.equal(crmCalls, beforeZernio + 1);
assert.equal(capiCalls, 3);
// A client profile cannot route into Wander's CRM even with a matching form id.
zernioBrand = {
  id: "client-brand",
  name: "Client",
  slug: "client",
  relationship: "client",
  metaPageId: "other-page",
};
await receiveZernioLead({
  ...payload,
  lead: { ...payload.lead, leadgenId: "10005" },
});
assert.equal(crmCalls, beforeZernio + 1);
assert.equal(capiCalls, 3);
const [clientLead] = await db
  .select()
  .from(metaLeadgenLeadTable)
  .where(eq(metaLeadgenLeadTable.leadgenId, "10005"));
assert.equal(clientLead?.brandId, "client-brand");
assert.equal(clientLead?.qualified, null);
await pg.close();
console.log("Performance lead acceptance passed");
