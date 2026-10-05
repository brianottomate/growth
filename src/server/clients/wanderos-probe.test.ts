import { expect, spyOn, test } from "bun:test";
import { probeWanderOsWebsite } from "./wanderos-site.client";

const websiteId = "1234567890123";
const html = `<img src="https://assets-websites.wander.com/${websiteId}/logo.png">`;

test("WanderOS probe verifies one search page even with no published homes", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
        calls.push({
          url:
            url instanceof Request
              ? url.url
              : url instanceof URL
                ? url.href
                : url,
          init,
        });
        return calls.length === 1
          ? new Response(html)
          : Response.json({ results: [], pagination: { has_more: true } });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    expect(await probeWanderOsWebsite("https://example.com")).toBe(websiteId);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe(
      "https://api.wander.com/saas/website/search?page=1&take=1",
    );
    expect(calls[1]!.init?.headers).toMatchObject({
      "x-website-id": websiteId,
    });
  } finally {
    fetchSpy.mockRestore();
  }
});

test("a website without WanderOS assets makes no listing requests", async () => {
  const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    new Response("<html>Existing brand website</html>"),
  );
  try {
    expect(await probeWanderOsWebsite("https://example.com")).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  } finally {
    fetchSpy.mockRestore();
  }
});

test("a failed WanderOS search can be retried instead of saving a negative detection", async () => {
  const fetchSpy = spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(html))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  try {
    expect(probeWanderOsWebsite("https://example.com")).rejects.toThrow(
      "Could not verify WanderOS",
    );
  } finally {
    fetchSpy.mockRestore();
  }
});
