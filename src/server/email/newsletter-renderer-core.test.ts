import { describe, expect, test } from "bun:test";

import { emailCopyGuidance } from "@/lib/brand-email-style";

import { renderDesignSystemNewsletter } from "./newsletter-renderer-core";

const document = {
  subject: "A weekend in the hills",
  bodyMarkdown: "Find a home for your next trip.",
  ctaLabel: "Explore homes",
  ctaUrl: "https://chalets.example/homes",
  templateKey: "editorial",
};

describe("brand email identity", () => {
  test("uses only the selected brand's copy guide", () => {
    const wanderGuide = emailCopyGuidance({
      name: "Wander",
      emailSender: { copyGuide: "Prefer: Find your happy place." },
    });
    const chaletsGuide = emailCopyGuidance({
      name: "Chalets",
      emailSender: { copyGuide: "Prefer: Time in the hills." },
    });
    const neutralGuide = emailCopyGuidance({ name: "Another brand" });
    expect(wanderGuide).toContain("Find your happy place");
    expect(chaletsGuide).toContain("Time in the hills");
    expect(chaletsGuide).not.toContain("Find your happy place");
    expect(neutralGuide).not.toContain("Find your happy place");
    expect(neutralGuide).not.toContain("Time in the hills");
  });
  test("keeps configured identity local to its brand and falls back to neutral", async () => {
    const styled = await renderDesignSystemNewsletter({
      document,
      brandName: "Chalets",
      sender: {
        fromName: "Chalets",
        logoUrl: "https://chalets.example/logo.png",
        tagline: "Time in the hills",
        theme: {
          backgroundColor: "#faf8f2",
          accentColor: "#24543a",
          accentTextColor: "#ffffff",
        },
      },
      legal: {
        address: { line1: "123 Main St", city: "Logan", country: "US" },
      },
      unsubscribeUrl: "https://chalets.example/unsubscribe",
    });
    expect(styled.html).toContain("#24543a");
    expect(styled.html).toContain("#faf8f2");
    expect(styled.html).toContain("https://chalets.example/logo.png");
    expect(styled.html).toContain("123 Main St");
    expect(styled.html).toContain("https://chalets.example/unsubscribe");
    expect(styled.html).not.toContain("Find your happy place");
    expect(styled.html).not.toContain("Personal Concierge");

    const neutral = await renderDesignSystemNewsletter({
      document,
      brandName: "Another brand",
    });
    expect(neutral.html).toContain("#f7f7f7");
    expect(neutral.html).not.toContain("#24543a");
    expect(neutral.html).not.toContain("chalets.example/logo.png");
    expect(neutral.html).not.toContain("Time in the hills");
    expect(neutral.html).not.toContain("wander.com");
  });
});
