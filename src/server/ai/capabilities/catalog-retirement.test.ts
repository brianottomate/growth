import { expect, test } from "bun:test";
import { z } from "zod";

test("retired actions are rejected by executable schemas", async () => {
  const { brandWrite, adsWrite } = await import("./domains");
  for (const action of ["purge", "previewPurge"]) {
    expect(
      brandWrite.validationSchema.safeParse({
        action,
        brandId: "brand",
        confirmName: "Brand",
      }).success,
    ).toBe(false);
  }
  expect(adsWrite.actions).not.toHaveProperty("createGoogle");
  expect(adsWrite.actions).not.toHaveProperty("createMetaDraft");
}, 20_000);

test("specialized Meta creation rejects standard campaign goals", async () => {
  const { createSpecializedMetaDraftAction } = await import("./ads");
  const schema = createSpecializedMetaDraftAction.inputSchema;
  const base = {
    brandSlug: "example",
    connectionAccountId: "connection",
    adAccountId: "act_1",
    name: "Campaign",
    budgetAmount: 50,
    budgetType: "daily",
    headline: "Headline",
    body: "Body",
    callToAction: "LEARN_MORE",
    linkUrl: "https://example.com",
    imageUrl: "https://example.com/image.jpg",
  };
  for (const goal of [
    "traffic",
    "engagement",
    "awareness",
    "video_views",
    "conversions",
  ]) {
    expect(schema.safeParse({ ...base, goal }).success).toBe(false);
  }
  expect(
    schema.safeParse({
      ...base,
      goal: "lead_generation",
      leadGenFormId: "form_1",
    }).success,
  ).toBe(true);
  expect(
    schema.safeParse({
      ...base,
      goal: "app_promotion",
      promotedObject: {
        applicationId: "app_1",
        objectStoreUrl: "https://example.com/app",
      },
    }).success,
  ).toBe(true);
}, 20_000);

test("Google draft input and output preserve separate crops", async () => {
  const { setPlatformDraftAction } = await import("./ads");
  const images = {
    landscape: "https://example.com/landscape.jpg",
    square: "https://example.com/square.jpg",
  };
  const parsed = setPlatformDraftAction.inputSchema.parse({
    platformCampaignId: "pcamp_1",
    google: { campaignType: "display", images },
  });
  expect(
    z
      .object({
        google: z.object({
          images: z.object({ landscape: z.string(), square: z.string() }),
        }),
      })
      .parse(parsed).google.images,
  ).toEqual(images);
  // Pin the nested wire contract independently of a provider call.
  const schema = JSON.stringify(
    z.toJSONSchema(setPlatformDraftAction.outputSchema),
  );
  expect(schema).toContain('"landscape"');
  expect(schema).toContain('"square"');
}, 20_000);
