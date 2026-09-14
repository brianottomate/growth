import { describe, expect, test } from "bun:test";

import {
  conflictingContactId,
  isRetryableHubspotError,
  withHubspotRetry,
} from "./hubspot-errors";

describe("a duplicate contact on create becomes an update, not a failed lead", () => {
  test("reads the existing id out of HubSpot's 409", () => {
    expect(
      conflictingContactId({
        code: 409,
        body: {
          status: "error",
          message: "Contact already exists. Existing ID: 123456789",
          category: "CONFLICT",
        },
      }),
    ).toBe("123456789");
  });

  test("other errors are not mistaken for a conflict", () => {
    expect(
      conflictingContactId({ code: 400, body: { message: "Existing ID: 1" } }),
    ).toBeNull();
    expect(
      conflictingContactId({ code: 409, body: { message: "nope" } }),
    ).toBeNull();
    expect(conflictingContactId(new Error("boom"))).toBeNull();
    expect(conflictingContactId(null)).toBeNull();
  });
});

describe("transient HubSpot failures are retried, permanent ones are not", () => {
  test("429 and 5xx are retryable; 4xx are not", () => {
    expect(isRetryableHubspotError({ code: 429 })).toBe(true);
    expect(isRetryableHubspotError({ code: 502 })).toBe(true);
    expect(isRetryableHubspotError({ code: 400 })).toBe(false);
    expect(isRetryableHubspotError({ code: 409 })).toBe(false);
    expect(isRetryableHubspotError(new Error("network"))).toBe(false);
  });

  test("a call that recovers within the budget succeeds; a 4xx surfaces at once", async () => {
    // The SDK throws ApiException, an Error carrying the HTTP status on `code`.
    const apiError = (code: number) =>
      Object.assign(new Error(`http ${code}`), { code });

    let calls = 0;
    const flaky = () => {
      calls++;
      return calls < 2 ? Promise.reject(apiError(503)) : Promise.resolve("ok");
    };
    expect(await withHubspotRetry("flaky", flaky, 3)).toBe("ok");
    expect(calls).toBe(2);

    let bad = 0;
    const permanent = () => {
      bad++;
      return Promise.reject(apiError(400));
    };
    const rejected = await withHubspotRetry("bad", permanent, 3).then(
      () => null,
      (error: unknown) => error,
    );
    expect(rejected).toMatchObject({ code: 400 });
    expect(bad).toBe(1);
  });
});
