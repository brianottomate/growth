import { expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  classifyBookingAttribution,
  parseSitesOrder,
  type BookingAttribution,
} from "@/lib/performance-booking";
import type { Database } from "@/server/db";
import { performanceBookingTable } from "@/server/db/performance-booking-schema";
import {
  classifyPerformanceBooking,
  recordPerformanceBooking,
} from "./performance-booking.service";
import {
  queuePerformanceBookingNotification,
  bookingSlackMessage,
} from "./performance-booking-notification.service";
import { workflowRunTable } from "@/server/db/creative-work-schema";
import { receiveSitesOrder } from "./performance-booking-webhook";

const payload = {
  data_type: "event",
  app: 767045,
  event_type: "Order Completed",
  event_time: "2026-10-15 12:00:00.123000",
  event_properties: {
    event_source: "server",
    environment: "production",
    website_id: "site-one",
    order_id: "booking-one",
    product_id: "home-one",
    currency: "USD",
    total: 123.45,
    revenue: 100,
    utm_source: "facebook",
    utm_id: "campaign-external",
  },
  user_properties: { initial_utm_medium: "email" },
  ip_address: "192.0.2.1",
};
const token = "synthetic-existing-webhook-token";
const request = (body: unknown = payload, credential = token) =>
  new Request("https://example.com/webhook", {
    method: "POST",
    headers: { authorization: `Bearer ${credential}` },
    body: JSON.stringify(body),
  });

// These boundaries protect customer ownership, counts and attribution confidence.
test("Sites rejects wrong projects, browser purchases and malformed amounts without requiring a guest user id", () => {
  expect(parseSitesOrder({ ...payload, app: 707736 }).status).toBe(
    "wrong_project",
  );
  expect(
    parseSitesOrder({
      ...payload,
      event_properties: { ...payload.event_properties, event_source: "client" },
    }).status,
  ).toBe("invalid_order");
  expect(
    parseSitesOrder({
      ...payload,
      event_properties: { ...payload.event_properties, environment: "staging" },
    }).status,
  ).toBe("invalid_order");
  expect(
    parseSitesOrder({
      ...payload,
      event_properties: { ...payload.event_properties, total: "123.45" },
    }).status,
  ).toBe("invalid_order");
  const parsed = parseSitesOrder(payload);
  if (parsed.status !== "valid") throw new Error(parsed.status);
  expect(parsed.booking.confirmedAt.toISOString()).toBe(
    "2026-10-15T12:00:00.123Z",
  );
  expect(JSON.stringify(parsed.booking)).not.toContain("192.0.2.1");
});

test("generic Meta/email signals and acquisition history never become confirmed bookings", () => {
  const attribution: BookingAttribution = {
    event: { fbclid: "click", utm_medium: "email" },
    current: {},
    last: {},
    initial: { utm_id: "external" },
  };
  const campaigns = [
    { id: "our-campaign", externalId: "external", name: "Summer" },
  ];
  expect(
    classifyBookingAttribution(attribution, campaigns, [], new Date())
      .confidence,
  ).toBe("possible");
  attribution.event.utm_campaign = "Summer";
  expect(
    classifyBookingAttribution(attribution, campaigns, [], new Date())
      .confidence,
  ).toBe("possible");
  attribution.event.utm_id = "external";
  expect(
    classifyBookingAttribution(attribution, campaigns, [], new Date())
      .confidence,
  ).toBe("confirmed");
  expect(
    classifyBookingAttribution(attribution, [], [], new Date()).confidence,
  ).toBe("possible");
  const email: BookingAttribution = {
    event: { utm_medium: "email", message_send_id: "sent-one" },
    current: {},
    last: {},
    initial: {},
  };
  const messages = [
    {
      id: "sent-one",
      providerBroadcastId: "broadcast",
      sentAt: new Date("2026-10-16T00:00:00Z"),
    },
  ];
  expect(
    classifyBookingAttribution(
      email,
      [],
      messages,
      new Date("2026-10-15T00:00:00Z"),
    ).confidence,
  ).toBe("possible");
  expect(
    classifyBookingAttribution(
      email,
      [],
      messages,
      new Date("2026-10-17T00:00:00Z"),
    ).confidence,
  ).toBe("confirmed");
});

test("auth, disabled ingest and failed persistence cannot acknowledge or schedule a booking", async () => {
  let calls = 0;
  const options = {
    token,
    enabled: true,
    record: async () => {
      calls++;
      throw new Error("DB unavailable");
    },
    classify: async () => {
      calls++;
    },
    notify: async () => {
      calls++;
    },
    after: () => {
      calls++;
    },
  };
  expect(
    (await receiveSitesOrder(request(payload, "wrong"), options)).status,
  ).toBe(401);
  expect(
    (await receiveSitesOrder(request(), { ...options, enabled: false })).status,
  ).toBe(503);
  expect(calls).toBe(0);
  expect((await receiveSitesOrder(request(), options)).status).toBe(503);
  expect(calls).toBe(1);
});

test("only relevant client bookings persist before ack; after classifies and replays cannot duplicate or cross customers", async () => {
  const pg = new PGlite();
  try {
    // Minimal pre-existing relations; the new table is built from the real migration.
    await pg.exec(`
      CREATE TABLE brand (id text primary key, organization_id text, wander_os_website_id text, name text, slug text);
      CREATE TABLE performance_account (id text primary key, brand_id text, organization_id text, deleted_at timestamp);
      CREATE TABLE performance_cycle (id text primary key, account_id text);
      CREATE TABLE platform_campaign (id text primary key, external_id text, name text, brand_id text, platform text, campaign_id text, performance_cycle_id text);
      CREATE TABLE platform_post (id text primary key, brand_id text);
      CREATE TABLE message_send_recipient (id text primary key, message_send_id text, status text, sent_at timestamp);
      CREATE TABLE message_send (id text primary key, provider_broadcast_id text, sent_at timestamp, platform_post_id text, status text);
      INSERT INTO brand VALUES ('brand-one','org-one','site-one','One','one'),('brand-two','org-two','site-two','Two','two');
      INSERT INTO performance_account VALUES ('account-one','brand-one','org-one',null),('account-two','brand-two','org-two',null);
      INSERT INTO platform_campaign VALUES ('campaign-one','campaign-external','Summer','brand-one','facebook','plan-one',null),('foreign-campaign','foreign-external','Other','brand-two','facebook','plan-two',null);
    `);
    await pg.exec(
      (
        await Bun.file(
          new URL(
            "../../../drizzle/0031_performance_bookings.sql",
            import.meta.url,
          ),
        ).text()
      ).replaceAll("--> statement-breakpoint", ""),
    );
    const initial = await Bun.file(
      new URL("../../../drizzle/0000_initial.sql", import.meta.url),
    ).text();
    await pg.exec(
      /CREATE TYPE "public"\."workflow_run_status"[^;]+;/.exec(initial)![0],
    );
    await pg.exec(
      /CREATE TABLE "workflow_run" \([\s\S]*?\n\);/.exec(initial)![0],
    );
    const client = drizzle(pg, { casing: "snake_case" }) as unknown as Database;
    const pending: (() => Promise<void>)[] = [];
    const notified: string[] = [];
    const options = {
      token,
      enabled: true,
      record: (booking: Parameters<typeof recordPerformanceBooking>[0]) =>
        recordPerformanceBooking(booking, client),
      classify: (id: string) => classifyPerformanceBooking(id, client),
      notify: async (id: string) => {
        notified.push(id);
      },
      after: (work: () => Promise<void>) => {
        pending.push(work);
      },
    };
    const send = (
      event_properties: Record<string, unknown> = payload.event_properties,
      user_properties: Record<string, string> = payload.user_properties,
    ) =>
      receiveSitesOrder(
        request({ ...payload, event_properties, user_properties }),
        options,
      );
    expect(
      await (
        await send({ ...payload.event_properties, website_id: "unlisted" })
      ).json(),
    ).toEqual({ status: "not_performance_client" });
    expect(
      await (
        await send(
          { ...payload.event_properties, utm_source: "organic", utm_id: "" },
          {},
        )
      ).json(),
    ).toEqual({ status: "no_relevant_attribution" });
    expect(pending).toHaveLength(0);
    expect(await client.select().from(performanceBookingTable)).toHaveLength(0);
    expect((await send()).status).toBe(200);
    let rows = await client.select().from(performanceBookingTable);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.confidence).toBe("possible");
    expect(notified).toHaveLength(0);
    expect(rows[0]!.classifiedAt).toBeNull();
    expect(rows[0]!.total).toBe(123.45);
    const alerts = await Promise.all([
      queuePerformanceBookingNotification("booking-one", client),
      queuePerformanceBookingNotification("booking-one", client),
    ]);
    expect(alerts.filter(Boolean)).toHaveLength(1);
    await pg.exec("UPDATE workflow_run SET status='succeeded'");
    expect(
      await queuePerformanceBookingNotification("booking-one", client),
    ).toBeUndefined();
    await pending.shift()!();
    expect(notified).toEqual(["booking-one"]);
    rows = await client.select().from(performanceBookingTable);
    expect(rows[0]!.confidence).toBe("confirmed");
    expect(rows[0]!.classifiedAt).not.toBeNull();
    expect(
      await queuePerformanceBookingNotification("booking-one", client),
    ).toBeDefined();
    expect(await client.select().from(workflowRunTable)).toHaveLength(2);
    const alert = bookingSlackMessage({
      booking: rows[0]!,
      brandId: "brand-one",
      brandName: "<@everyone>",
      brandSlug: "one",
      organizationId: "org-one",
    });
    expect(alert).toContain("Confirmed");
    expect(alert).not.toContain("<@everyone>");
    expect(alert).not.toContain("campaign-external");
    expect((await send()).status).toBe(200);
    expect(await client.select().from(performanceBookingTable)).toHaveLength(1);
    expect(
      (await send({ ...payload.event_properties, website_id: "site-two" }))
        .status,
    ).toBe(409);
    expect(
      (
        await send({
          ...payload.event_properties,
          order_id: "booking-two",
          utm_id: "foreign-external",
        })
      ).status,
    ).toBe(200);
    for (const work of pending.splice(0)) await work();
    rows = await client.select().from(performanceBookingTable);
    expect(rows.find((r) => r.bookingId === "booking-two")!.confidence).toBe(
      "possible",
    );
    await pg.exec(`
      INSERT INTO platform_post VALUES ('email-post','brand-one');
      INSERT INTO message_send VALUES ('msg-early','bulk-1',null,'email-post','sending');
      INSERT INTO message_send_recipient VALUES ('recipient-1','msg-early','sent','2026-10-14T00:00:00Z');
    `);
    expect(
      (
        await send({
          ...payload.event_properties,
          order_id: "booking-email",
          utm_source: "wander_performance",
          utm_medium: "email",
          utm_id: "msg-early",
        })
      ).status,
    ).toBe(200);
    for (const work of pending.splice(0)) await work();
    rows = await client.select().from(performanceBookingTable);
    expect(rows.find((r) => r.bookingId === "booking-email")!.confidence).toBe(
      "confirmed",
    );
    await pg.exec(
      `INSERT INTO brand VALUES ('duplicate','org-one','site-one','Duplicate','duplicate'); INSERT INTO performance_account VALUES ('duplicate-account','duplicate','org-one',null);`,
    );
    expect(
      await (
        await send({ ...payload.event_properties, order_id: "booking-three" })
      ).json(),
    ).toEqual({ status: "ambiguous_client" });
    expect(await client.select().from(performanceBookingTable)).toHaveLength(3);
  } finally {
    await pg.close();
  }
}, 30000);

test("ChatGPT referrals are retained as possible without accepting lookalike domains", () => {
  for (const props of [
    { utm_source: "chatgpt.com" },
    { referrer: "https://chatgpt.com/c/123" },
    { referring_domain: "chat.openai.com" },
  ]) {
    const parsed = parseSitesOrder({
      ...payload,
      event_properties: {
        ...payload.event_properties,
        utm_source: undefined,
        utm_id: undefined,
        ...props,
      },
      user_properties: {},
    });
    if (parsed.status !== "valid") throw new Error(parsed.status);
    const classified = classifyBookingAttribution(
      parsed.booking.attribution,
      [],
      [],
      new Date(),
    );
    expect(classified.confidence).toBe("possible");
    expect(classified.evidence).toEqual([
      { scope: "event", channel: "chatgpt", kind: "signal" },
    ]);
  }
  const attribution: BookingAttribution = {
    event: { referrer: "https://chatgpt.com.evil.example/" },
    current: { utm_source: "notchatgpt.com" },
    last: { referrer: "https://evil.example/?source=chatgpt.com" },
    initial: {},
  };
  expect(
    classifyBookingAttribution(attribution, [], [], new Date()).evidence,
  ).toHaveLength(0);
});

test("classification failure still alerts possible attribution after acknowledgement", async () => {
  const pending: (() => Promise<void>)[] = [];
  let notified = false;
  const response = await receiveSitesOrder(request(), {
    token,
    enabled: true,
    record: async () => ({ status: "accepted", bookingId: "booking-one" }),
    classify: async () => {
      throw new Error("classification unavailable");
    },
    notify: async () => {
      notified = true;
    },
    after: (work) => {
      pending.push(work);
    },
  });
  expect(response.status).toBe(200);
  expect(notified).toBe(false);
  await pending[0]!();
  expect(notified).toBe(true);
});
