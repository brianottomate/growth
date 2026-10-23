import { describe, expect, test } from "bun:test";
import { createGoogleAdsTransport } from "./google-ads.transport";
const oauth = {
  loginCustomerId: "123-456-7890",
  clientId: "oauth-client",
  clientSecret: "oauth-secret",
  refreshToken: "refresh-secret",
};
describe("Google Ads server authentication", () => {
  test("invalid service credentials never fall back to a personal OAuth identity", async () => {
    const client = createGoogleAdsTransport({
      ...oauth,
      serviceAccountJson: "{secret-invalid-json",
    });
    const error = await client
      .search("1234567890", "SELECT customer.id FROM customer")
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(
      "Invalid Google Ads service account configuration",
    );
  });
  test("invalid customer IDs cannot alter the Google request path", async () => {
    const client = createGoogleAdsTransport(oauth);
    const error = await client
      .search("123/../../other", "SELECT customer.id FROM customer")
      .catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Invalid Google Ads customer ID");
  });
});
