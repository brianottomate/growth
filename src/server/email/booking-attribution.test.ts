import { expect, test } from "bun:test";
import { toPlainText } from "@react-email/render";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { tagBookingLinks } from "./booking-attribution";
import {
  parseSitesOrder,
  classifyBookingAttribution,
  SITES_AMPLITUDE_PROJECT_ID,
} from "@/lib/performance-booking";

test("a prepared booking link preserves dates and reconciles only to a recorded customer send", () => {
  const markup =
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html><body><!--[if mso]>Outlook<![endif]-->';
  const html = tagBookingLinks(
    markup +
      '<a href="https://customer.example/book/1?checkin=2026-11-01&amp;guests=4#dates">Book</a><a href="https://other.example/book">Other</a><a href="{{{ pm:unsubscribe }}}">Unsubscribe</a><a href="https://[invalid">Broken</a></body></html>',
    {
      siteUrl: "https://customer.example",
      sendId: "msg_email1",
      campaign: "post_email1",
    },
  );
  expect(html.startsWith(markup)).toBe(true);
  expect(html.endsWith("</body></html>")).toBe(true);
  const hrefs: string[] = [];
  const visit = (node: DefaultTreeAdapterMap["node"]) => {
    if ("tagName" in node && node.tagName === "a")
      hrefs.push(node.attrs.find((a) => a.name === "href")!.value);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(parse(html));
  const link = new URL(hrefs[0]!);
  expect(link.searchParams.get("checkin")).toBe("2026-11-01");
  expect(link.searchParams.get("guests")).toBe("4");
  expect(link.hash).toBe("#dates");
  expect(link.searchParams.get("utm_id")).toBe("msg_email1");
  expect(link.searchParams.get("utm_medium")).toBe("email");
  expect(toPlainText(html)).toContain(link.href);
  expect(hrefs.slice(1)).toEqual([
    "https://other.example/book",
    "{{{ pm:unsubscribe }}}",
    "https://[invalid",
  ]);
  const parsed = parseSitesOrder({
    data_type: "event",
    app: SITES_AMPLITUDE_PROJECT_ID,
    event_type: "Order Completed",
    event_time: "2026-11-02T00:00:00Z",
    event_properties: {
      event_source: "server",
      environment: "production",
      website_id: "site1",
      order_id: "booking1",
      product_id: "unit1",
      currency: "USD",
      total: 400,
      ...Object.fromEntries(link.searchParams),
    },
    user_properties: {},
  });
  expect(parsed.status).toBe("valid");
  if (parsed.status !== "valid") throw new Error(parsed.status);
  expect(
    classifyBookingAttribution(
      parsed.booking.attribution,
      [],
      [],
      parsed.booking.confirmedAt,
    ).confidence,
  ).toBe("possible");
  expect(
    classifyBookingAttribution(
      parsed.booking.attribution,
      [],
      [
        {
          id: "msg_email1",
          providerBroadcastId: "server1",
          sentAt: new Date("2026-11-01T00:00:00Z"),
        },
      ],
      parsed.booking.confirmedAt,
    ).confidence,
  ).toBe("confirmed");
  const staleProfile = {
    ...parsed.booking.attribution,
    event: { utm_source: "google", utm_medium: "cpc" },
    current: { utm_medium: "email", utm_id: "msg_email1" },
  };
  expect(
    classifyBookingAttribution(
      staleProfile,
      [],
      [
        {
          id: "msg_email1",
          providerBroadcastId: "server1",
          sentAt: new Date("2026-11-01T00:00:00Z"),
        },
      ],
      parsed.booking.confirmedAt,
    ).confidence,
  ).toBe("possible");
});
