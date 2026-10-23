import { describe, expect, test } from "bun:test";
import { requestSchema, specForTopic, topics } from "./catalog";

describe("public demo boundary", () => {
  test("rejects empty and oversized questions before paid inference", () => {
    for (const question of ["", "   ", "a".repeat(601)]) {
      expect(requestSchema.safeParse({ question }).success).toBe(false);
    }
    expect(
      requestSchema.parse({ question: "  Show me a website  " }).question,
    ).toBe("Show me a website");
  });
  test("does not accept arbitrary previous topics or unbounded conversation history", () => {
    expect(
      requestSchema.safeParse({
        question: "And this?",
        previousTopic: "publishCampaign",
      }).success,
    ).toBe(false);
    expect(
      requestSchema.safeParse({
        question: "And this?",
        previousQuestion: "a".repeat(601),
      }).success,
    ).toBe(false);
    expect(
      requestSchema.parse({
        question: "Show a website",
        apiKey: "untrusted",
        spec: { type: "script" },
      }),
    ).toEqual({ question: "Show a website" });
  });
  test("unsupported questions never render a misleading product preview", () => {
    expect(specForTopic("unsupported")).toBeNull();
  });
  test("model choices can only display fixed read-only previews without arbitrary data or actions", () => {
    const allowed = new Set([
      "BookingPreview",
      "CampaignPreview",
      "IntegrationPreview",
      "AnalyticsPreview",
    ]);
    for (const topic of topics.filter((t) => t !== "unsupported")) {
      const spec = specForTopic(topic)!;
      expect(Object.keys(spec.elements)).toEqual(["preview"]);
      const element = spec.elements.preview!;
      expect(allowed.has(element.type)).toBe(true);
      expect(element.props).toEqual({});
      expect(element).not.toHaveProperty("on");
    }
  });
});
