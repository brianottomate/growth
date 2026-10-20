import { describe, expect, test } from "bun:test";
import {
  compilePostmarkBroadcast,
  materializePostmarkBroadcast,
  postmarkBroadcastModel,
  postmarkSetupMatches,
} from "./postmark-broadcast-content";

describe("prepared Postmark content", () => {
  test("seed materialization matches the live bulk model and leaves no guest fields literal", () => {
    const template = compilePostmarkBroadcast({
      subject: "A stay for {{first_name|you}}",
      html: '<link href="https://fonts.example/font.css?a=1&amp;b=2" rel="stylesheet"><p>Hi {{first_name|there}} & welcome.</p><a href="https://example.com/?recipient=__GROWTH_EMAIL_RECIPIENT_KEY__">Go</a><a href="{{{ pm:unsubscribe }}}">Unsubscribe</a>',
      text: "Hi {{first_name|there}}: __GROWTH_EMAIL_RECIPIENT_KEY__ {{{ pm:unsubscribe }}}",
      recipientKeyPlaceholder: "__GROWTH_EMAIL_RECIPIENT_KEY__",
      growthManagedUnsubscribe: true,
    });
    const recipient = {
      email: "thisisbriansun@gmail.com",
      first_name: "Brian & team",
    };
    const binding = {
      recipientKey: "seed-test",
      unsubscribeUrl: "https://example.com/unsubscribe",
    };
    const liveModel = postmarkBroadcastModel(template, recipient, binding);
    const seed = materializePostmarkBroadcast(template, recipient, binding);

    expect(liveModel.f0).toBe("Brian & team");
    expect(liveModel.f1).toBe("Brian & team");
    expect(liveModel.f2).toBe("Brian & team");
    expect(liveModel.growth_recipient_key).toBe("seed-test");
    expect(liveModel.unsubscribe_url).toBe("https://example.com/unsubscribe");
    expect(seed.subject).toBe("A stay for Brian & team");
    expect(seed.html).toContain("Hi Brian &amp; team & welcome.");
    expect(seed.html).toContain("recipient=seed-test");
    expect(seed.html).toContain('href="https://example.com/unsubscribe"');
    expect(seed.html).toContain(
      '<style>@import url("https://fonts.example/font.css?a=1&b=2");</style>',
    );
    expect(seed.text).toBe(
      "Hi Brian & team: seed-test https://example.com/unsubscribe",
    );
    expect(seed.subject).not.toContain("{{");
    expect(seed.html).not.toContain("{{");
    expect(seed.text).not.toContain("{{");
  });

  test("seed and live use the same field fallback", () => {
    const template = compilePostmarkBroadcast({
      subject: "For {{first_name|you}}",
      html: "<p>Hi {{first_name|there}}</p>",
      text: "Hi {{first_name|there}}",
      recipientKeyPlaceholder: "unused",
      growthManagedUnsubscribe: false,
    });
    const recipient = { email: "thisisbriansun@gmail.com" };
    const binding = { recipientKey: "seed-test" };
    const model = postmarkBroadcastModel(template, recipient, binding);
    const seed = materializePostmarkBroadcast(template, recipient, binding);
    expect(model).toMatchObject({ f0: "you", f1: "there", f2: "there" });
    expect(seed).toEqual({
      subject: "For you",
      html: "<p>Hi there</p>",
      text: "Hi there",
    });
  });

  test("a prepared sender, server or stream cannot silently change", () => {
    const sender = {
      fromName: "Winter Park Escapes",
      fromEmail: "hello@winterparkescapes.com",
      replyTo: null,
    };
    const prepared = { sender, serverId: 123, messageStream: "broadcasts" };
    expect(postmarkSetupMatches(prepared, prepared)).toBe(true);
    expect(
      postmarkSetupMatches(prepared, {
        ...prepared,
        sender: { ...sender, fromEmail: "other@example.com" },
      }),
    ).toBe(false);
    expect(postmarkSetupMatches(prepared, { ...prepared, serverId: 456 })).toBe(
      false,
    );
    expect(
      postmarkSetupMatches(prepared, {
        ...prepared,
        messageStream: "transactional",
      }),
    ).toBe(false);
  });
});
