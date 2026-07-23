import { defineTool } from "eve/tools";
import { z } from "zod";
import { catalogFor } from "../lib/catalog.js";

/**
 * Compare observed vendors/cookies (from scan_page) against the site's
 * declared catalog. Undeclared observations are the merchant-injection
 * signal legal cares about.
 */
export default defineTool({
  description:
    "Diff observed tracker vendors and cookies against a site's declared catalog. Returns undeclared vendors (observed but not declared), unobserved declarations, and unexpected cookies.",
  inputSchema: z.object({
    hostname: z.string().describe("Site hostname, e.g. germanvacationstays.de"),
    observedVendors: z.array(z.string()).describe("Vendor names from scan_page trackers[]"),
    observedCookies: z
      .array(z.string())
      .default([])
      .describe("Cookie names from scan_page setCookies (name part only)"),
  }),
  async execute({ hostname, observedVendors, observedCookies }) {
    const { key, catalog } = catalogFor(hostname);
    const declared = new Set(catalog.declaredVendors);
    const observed = new Set(observedVendors);

    const cookieNames = observedCookies.map((c) => c.split("=")[0].trim());
    const expectedCookies = new Set(catalog.expectedCookies);

    return {
      catalogUsed: key,
      undeclaredVendors: [...observed].filter((v) => !declared.has(v)),
      declaredButNotObserved: [...declared].filter((v) => !observed.has(v)),
      unexpectedCookies: cookieNames.filter((c) => !expectedCookies.has(c)),
      notes: catalog.notes ?? null,
    };
  },
});
