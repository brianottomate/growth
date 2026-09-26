import { describe, expect, test } from "bun:test";

import { digestDesignStudioCode, sectionTitle } from "./design-studio-export";
import type { ListingsDigest } from "./listings-digest";

const home = {
  name: "Wander Park City Lighthouse",
  city: "Park City",
  state: "Utah",
  sleeps: 12,
  operated: false,
  rating: 5,
  href: "https://www.wander.com/property/wander-park-city-lighthouse?checkIn=2026-10-04&checkOut=2026-10-07",
  imageUrl: "https://example.r2.dev/lighthouse.jpg",
  priceLabel: "$3,457 for 3 nights (October 4-7)",
  savingsUsd: 300,
};

const digest: ListingsDigest = {
  schema: "wander-growth.listings-digest.v1",
  sections: [
    {
      heading: "PARK CITY, UTAH",
      explore: {
        href: "https://www.wander.com/s?location=Park+City",
        place: "Park City",
      },
      properties: [
        home,
        {
          ...home,
          name: "Canyons Modern",
          city: "Snyderville",
          rating: null,
          savingsUsd: 250,
        },
      ],
    },
    {
      heading: "KIAWAH ISLAND, SC",
      properties: [{ ...home, city: "Kiawah Island", state: "South Carolina" }],
    },
  ],
};

describe("Design Studio export", () => {
  const code = digestDesignStudioCode(digest);

  test("prints a featured home the way the weekly issue does", () => {
    expect(code).toContain(
      '<span style="color:  rgb(32, 32, 32)">PARK CITY, UTAH • 12 GUESTS</span>',
    );
    expect(code).toContain("Home in Park City, Utah • ★ 5.0</x-heading-2>");
    expect(code).toContain("$3,457 for 3 nights (October 4-7)</x-paragraph>");
    expect(code).toContain(">Save ~$300 booking on Wander</x-cta>");
  });

  test("a listed home is a 40/60 row, New when unrated, shorter savings line", () => {
    expect(code).toContain(":layout='[40,60]'");
    expect(code).toContain("Home in Snyderville • ★ New</x-heading-2>");
    expect(code).toContain(">Save ~$250 on Wander</x-cta>");
  });

  test("escapes the ampersands in its links", () => {
    expect(code).toContain(
      "wander-park-city-lighthouse?checkIn=2026-10-04&amp;checkOut=2026-10-07",
    );
  });

  test("one block per market, a divider between, Explore only where known", () => {
    expect(code.match(/data-layer-label="Section 1 — button"/g)).toHaveLength(
      2,
    );
    expect(code.match(/data-layer-label="Section 1 — label"/g)).toHaveLength(1);
    expect(code.match(/>Explore /g)).toHaveLength(1);
  });

  test("headings read as titles", () => {
    expect(sectionTitle("SAN DIEGO COAST, CA")).toBe("San Diego Coast, CA");
    expect(sectionTitle("Your escape to Kiawah")).toBe("Your escape to Kiawah");
  });
});

describe("the intro", () => {
  test("sits above the markets with her greeting, minus the model's salutation", () => {
    const code = digestDesignStudioCode(digest, {
      bodyMarkdown: "Hello,\n\nFall color moves **fast** in the mountains.",
    });
    expect(code.indexOf("Greeting + intro")).toBeLessThan(
      code.indexOf('data-layer-label="Section 1 — button"'),
    );
    expect(code).toContain(
      '👋 Hi there{% if customer["first name"] != blank %}',
    );
    expect(code).toContain(
      "Fall color moves <strong>fast</strong> in the mountains.",
    );
    expect(code).not.toContain(">Hello,<");
  });

  test("no intro, no greeting section", () => {
    expect(digestDesignStudioCode(digest)).not.toContain("Greeting + intro");
  });
});
