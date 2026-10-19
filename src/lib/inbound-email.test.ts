import { expect, test } from "bun:test";

import { inspirationAddress, parseInspirationToken } from "./inbound-email";

test("newsletter forwarding preserves the brand's case-sensitive identity", () => {
  const brandId = "brand_vMPu7WQrhL3uZG78";
  expect(
    parseInspirationToken([
      "other@example.com",
      `Indie Campers <${inspirationAddress(brandId)}>`,
    ]),
  ).toBe(brandId);
  expect(parseInspirationToken(["inspo@lexaomo.resend.app"])).toBeNull();
});
