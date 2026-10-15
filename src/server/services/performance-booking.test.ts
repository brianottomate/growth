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
      CREATE TABLE brand (id text primary key, organization_id text, wander_os_website_id text);
      CREATE TABLE performance_account (id text primary key, brand_id text, organization_id text, deleted_at timestamp);
      CREATE TABLE performance_cycle (id text primary key, account_id text);
      CREATE TABLE platform_campaign (id text primary key, external_id text, name text, brand_id text, platform text, campaign_id text, performance_cycle_id text);
      CREATE TABLE platform_post (id text primary key, brand_id text);
      CREATE TABLE message_send (id text primary key, provider_broadcast_id text, sent_at timestamp, platform_post_id text, status text);
      INSERT INTO brand VALUES ('brand-one','org-one','site-one'),('brand-two','org-two','site-two');
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
    const client = drizzle(pg, { casing: "snake_case" }) as unknown as Database;
    const pending: (() => Promise<void>)[] = [];
    const options = {
      token,
      enabled: true,
      record: (booking: Parameters<typeof recordPerformanceBooking>[0]) =>
        recordPerformanceBooking(booking, client),
      classify: (id: string) => classifyPerformanceBooking(id, client),
      after: (work: () => Promise<void>) => {
        pending.push(work);
      },
    };
    const send = (
      event_properties = payload.event_properties,
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
    expect(rows[0]!.classifiedAt).toBeNull();
    expect(rows[0]!.total).toBe(123.45);
    await pending.shift()!();
    rows = await client.select().from(performanceBookingTable);
    expect(rows[0]!.confidence).toBe("confirmed");
    expect(rows[0]!.classifiedAt).not.toBeNull();
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
    await pg.exec(
      `INSERT INTO brand VALUES ('duplicate','org-one','site-one'); INSERT INTO performance_account VALUES ('duplicate-account','duplicate','org-one',null);`,
    );
    expect(
      await (
        await send({ ...payload.event_properties, order_id: "booking-three" })
      ).json(),
    ).toEqual({ status: "ambiguous_client" });
    expect(await client.select().from(performanceBookingTable)).toHaveLength(2);
  } finally {
    await pg.close();
  }
}, 30000);
