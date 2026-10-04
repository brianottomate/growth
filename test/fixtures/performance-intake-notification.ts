import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { z } from "zod";

const runtime = {
  NEXT_PUBLIC_BASE_URL: "https://growth.example.com",
  NEXT_PUBLIC_VERCEL_ENV: "production",
  SLACK_API_TOKEN: "test-only-slack-token",
  GROWTH_GATEWAY_API_TOKEN: "test-only-gateway-token",
};
void mock.module("@/env", () => ({
  env: runtime,
  envSelect: <T>(values: { prod: T; test: T }) =>
    runtime.NEXT_PUBLIC_VERCEL_ENV === "production" ? values.prod : values.test,
}));
const submittedAt = new Date("2026-09-29T21:00:00.000Z");
const receipt = {
  id: "perfintake_test",
  submittedAt,
  brandId: "brd_test",
  brand: {
    id: "brd_test",
    name: "Acme Rentals",
    slug: "acme-rentals" as string | null,
  },
};
let saved: typeof receipt | undefined = receipt;
const findReceipt = mock(async (_query?: unknown) => saved);
void mock.module("@/server/db", () => ({
  db: { query: { performanceIntakeTable: { findFirst: findReceipt } } },
}));
const next = await import("next/server");
const deferred: Array<() => Promise<void>> = [];
void mock.module("next/server", () => ({
  ...next,
  after: (callback: () => Promise<void>) => deferred.push(callback),
}));
class PerformanceError extends Error {}
void mock.module("@/server/services/performance.service", () => ({
  PerformanceError,
}));
const save = mock(async () => ({ intakeId: receipt.id }));
void mock.module("@/server/services/performance-intake.service", () => ({
  submitPerformanceIntake: save,
  submitIntakeSchema: z.object({
    slug: z.string().min(1),
    answers: z.record(z.string(), z.unknown()),
  }),
}));
const { notifyPerformanceIntakeSubmission } =
  await import("@/server/services/performance-intake-notification.service");
const { POST } = await import("@/app/api/intake/v1/submit/route");
type SlackPayload = {
  channel: string;
  text: string;
  blocks?: unknown[];
  unfurl_links?: boolean;
  unfurl_media?: boolean;
};
const posts: SlackPayload[] = [];
let results: Array<"ok" | "fail" | "throw"> = [];
const http = spyOn(globalThis, "fetch");
const errors = spyOn(console, "error");

beforeEach(() => {
  saved = { ...receipt, brand: { ...receipt.brand } };
  runtime.NEXT_PUBLIC_VERCEL_ENV = "production";
  posts.length = 0;
  results = [];
  deferred.length = 0;
  findReceipt.mockReset().mockImplementation(async () => saved);
  save.mockReset().mockResolvedValue({ intakeId: receipt.id });
  errors.mockReset().mockImplementation(() => undefined);
  http.mockReset().mockImplementation(
    Object.assign(
      async (
        url: Parameters<typeof fetch>[0],
        init?: Parameters<typeof fetch>[1],
      ) => {
        expect(url).toBe("https://slack.com/api/chat.postMessage");
        if (typeof init?.body !== "string")
          throw new Error("Expected JSON Slack body");
        posts.push(JSON.parse(init.body) as SlackPayload);
        const result = results.shift() ?? "ok";
        if (result === "throw") throw new Error("network unavailable");
        return Response.json(
          result === "ok"
            ? { ok: true, ts: "123.456" }
            : { ok: false, error: "internal_error" },
        );
      },
      { preconnect: () => undefined },
    ),
  );
});

function request(
  body: unknown = { slug: "acme-rentals", answers: {} },
  authorized = true,
) {
  return new next.NextRequest(
    "https://growth.example.com/api/intake/v1/submit",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(authorized
          ? { authorization: `Bearer ${runtime.GROWTH_GATEWAY_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(body),
    },
  );
}

describe("Performance onboarding alerts", () => {
  test("tells Performance and Micaela which customer submitted and where to read it", async () => {
    await notifyPerformanceIntakeSubmission(receipt.id);
    expect(posts).toHaveLength(1);
    const post = posts[0]!;
    const message = JSON.stringify(post);
    expect(post.channel).toBe("C0BSSECHK08");
    expect(message).toContain("<@U0574R1RCD9>");
    expect(message).toContain("Acme Rentals");
    expect(message).toContain(
      "https://growth.example.com/app/performance/clients/acme-rentals#submission",
    );
    expect(
      message.includes(submittedAt.toISOString()) ||
        message.includes(String(submittedAt.getTime() / 1000)),
    ).toBe(true);
    expect(post.unfurl_links).toBe(false);
    expect(post.unfurl_media).toBe(false);
    expect(message).not.toContain(runtime.SLACK_API_TOKEN);
  });

  test("customer-controlled names cannot inject Slack mentions, and slugs stay in one URL segment", async () => {
    saved!.brand.name = "Acme <!channel> <@UATTACK> & Co";
    saved!.brand.slug = "acme/rentals";
    await notifyPerformanceIntakeSubmission(receipt.id);
    const message = JSON.stringify(posts[0]);
    expect(message).not.toContain("<!channel>");
    expect(message).not.toContain("<@UATTACK>");
    expect(message).toContain("&lt;!channel&gt;");
    expect(message).toContain("acme%2Frentals#submission");
  });

  test("brands without a slug link to the client list, not a nonexistent brand page", async () => {
    saved!.brand.slug = null;
    await notifyPerformanceIntakeSubmission(receipt.id);
    expect(JSON.stringify(posts[0])).toContain(
      "/app/performance/clients|View clients",
    );
  });

  test("previews post only to the testing channel without pinging Micaela", async () => {
    runtime.NEXT_PUBLIC_VERCEL_ENV = "preview";
    await notifyPerformanceIntakeSubmission(receipt.id);
    expect(posts[0]!.channel).toBe("radio-slack-testing");
    expect(JSON.stringify(posts[0])).not.toContain("<@U0574R1RCD9>");
  });

  test("a transient Slack outage recovers, without posting again after success", async () => {
    results = ["fail", "ok"];
    await notifyPerformanceIntakeSubmission(receipt.id);
    expect(posts).toHaveLength(2);
    expect(posts[1]).toEqual(posts[0]);
  });

  test("a persistent Slack outage is bounded and reported without rejecting", async () => {
    results = ["throw", "fail", "fail"];
    expect(await notifyPerformanceIntakeSubmission(receipt.id)).toBeUndefined();
    expect(posts).toHaveLength(3);
    expect(errors.mock.calls.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors.mock.calls)).toContain(receipt.id);
  });

  test("a temporary receipt lookup failure can recover", async () => {
    findReceipt.mockRejectedValueOnce(new Error("database unavailable"));
    await notifyPerformanceIntakeSubmission(receipt.id);
    expect(posts).toHaveLength(1);
  });

  test("a missing receipt cannot generate a fabricated alert", async () => {
    saved = undefined;
    expect(await notifyPerformanceIntakeSubmission(receipt.id)).toBeUndefined();
    expect(posts).toHaveLength(0);
    expect(errors.mock.calls.length).toBeGreaterThan(0);
  });
});

describe("intake submission boundary", () => {
  test("returns the saved receipt before Slack runs, then delivers in the deferred task", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, intakeId: receipt.id });
    expect(posts).toHaveLength(0);
    expect(deferred).toHaveLength(1);
    await deferred[0]!();
    expect(posts[0]!.channel).toBe("C0BSSECHK08");
  });

  test("unauthorized and invalid submissions cannot trigger an alert", async () => {
    expect((await POST(request(undefined, false))).status).toBe(401);
    expect((await POST(request({ answers: {} }))).status).toBe(400);
    expect(deferred).toHaveLength(0);
    expect(posts).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });

  test("a failed save does not announce a submission", async () => {
    save.mockRejectedValueOnce(new Error("database unavailable"));
    expect((await POST(request())).status).toBe(500);
    expect(deferred).toHaveLength(0);
    expect(posts).toHaveLength(0);
  });
});
