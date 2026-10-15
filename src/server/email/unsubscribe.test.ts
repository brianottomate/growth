import { describe, expect, test } from "bun:test";

import {
  personalUnsubscribe,
  readUnsubscribeToken,
  unsubscribeToken,
} from "./unsubscribe";

// The link is the only credential on a public page that writes an opt-out,
// so an edited token must never unsubscribe another guest or another brand.
describe("unsubscribe tokens", () => {
  test("round-trips the brand and the normalized address", () => {
    const token = unsubscribeToken("brand_a", " Ann@Example.com ");
    expect(readUnsubscribeToken(token)).toEqual({
      brandId: "brand_a",
      email: "ann@example.com",
    });
  });

  test("rejects a token whose brand or address was swapped", () => {
    const [, signature] = unsubscribeToken("brand_a", "ann@example.com").split(
      ".",
    );
    const forged = Buffer.from(
      JSON.stringify(["brand_b", "bob@example.com"]),
    ).toString("base64url");
    expect(readUnsubscribeToken(`${forged}.${signature}`)).toBeNull();
    expect(readUnsubscribeToken("not-a-token")).toBeNull();
  });

  test("sends the one-click header pair", () => {
    const { headers } = personalUnsubscribe("brand_a", "ann@example.com");
    expect(headers.map((header) => header.Name)).toEqual([
      "List-Unsubscribe",
      "List-Unsubscribe-Post",
    ]);
    expect(headers[1]!.Value).toBe("List-Unsubscribe=One-Click");
  });
});
