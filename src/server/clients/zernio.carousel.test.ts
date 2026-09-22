import { afterEach, beforeEach, expect, it, spyOn, type Mock } from "bun:test";
import {
  createZernioStandaloneAd,
  type CreateZernioStandaloneAdInput,
} from "./zernio.client";
import { env } from "@/env";
const originalKey = env.ZERNIO_API_KEY;
beforeEach(() => {
  (env as { ZERNIO_API_KEY?: string }).ZERNIO_API_KEY = "test-key";
});
const input: CreateZernioStandaloneAdInput = {
  accountId: "connection",
  adAccountId: "account",
  pageId: "client-page",
  adSetId: "destination",
  name: "Carousel",
  goal: "conversions",
  status: "PAUSED",
  headline: "Stay",
  body: "Book a stay",
  callToAction: "LEARN_MORE",
  linkUrl: "https://example.com",
  carouselCards: [
    { imageUrl: "https://example.com/a.jpg" },
    { imageUrl: "https://example.com/b.jpg" },
  ],
};
let fetchSpy: Mock<typeof fetch> | undefined;
afterEach(() => {
  fetchSpy?.mockRestore();
  (env as { ZERNIO_API_KEY?: string }).ZERNIO_API_KEY = originalKey;
});
function provider(page: string, attachFails = false) {
  const calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        const path = new URL(url instanceof Request ? url.url : url.toString())
          .pathname;
        const body = (
          typeof init?.body === "string" ? JSON.parse(init.body) : {}
        ) as Record<string, unknown>;
        calls.push({ path, body });
        if (init?.method === "DELETE") return Response.json({ deleted: true });
        if (path.endsWith("/creatives/creative"))
          return Response.json({
            creative: { object_story_spec: { page_id: page } },
          });
        if (body.existingCreativeId)
          return Response.json(
            attachFails
              ? { error: "attach failed" }
              : { ad: { platformAdId: "attached" } },
            { status: attachFails ? 400 : 200 },
          );
        return Response.json({
          ad: {
            platformCampaignId: "temporary",
            creative: { creativeId: "creative" },
          },
        });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  return calls;
}
it("reuses a verified client-Page carousel and removes only its paused preparation campaign", async () => {
  const calls = provider("client-page");
  const result = await createZernioStandaloneAd(input, {
    idempotencyKey: "test",
    carouselSeedBudget: 33,
  });
  expect(result.ad?.platformAdId).toBe("attached");
  expect(calls[0]!.body).toMatchObject({
    pageId: "client-page",
    status: "PAUSED",
    goal: "traffic",
    budgetAmount: 33,
  });
  expect(calls[0]!.body.adSetId).toBeUndefined();
  expect(calls[2]!.body).toMatchObject({
    adSetId: "destination",
    existingCreativeId: "creative",
    status: "PAUSED",
  });
  expect(calls[2]!.body.carouselCards).toBeUndefined();
  expect(calls[3]!.path).toEndWith("/campaigns/temporary");
});
it("never attaches a carousel with the managing Page identity", async () => {
  const calls = provider("manager-page");
  const error = await createZernioStandaloneAd(input, {
    idempotencyKey: "test",
    carouselSeedBudget: 33,
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("requested Page");
  expect(calls.some((c) => c.body.existingCreativeId)).toBe(false);
  expect(calls.at(-1)!.path).toEndWith("/campaigns/temporary");
});
it("cleans up preparation when attachment fails", async () => {
  const calls = provider("client-page", true);
  const error = await createZernioStandaloneAd(input, {
    idempotencyKey: "test",
    carouselSeedBudget: 33,
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("attach failed");
  expect(calls.at(-1)!.path).toEndWith("/campaigns/temporary");
});
