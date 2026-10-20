import { afterEach, expect, spyOn, test } from "bun:test";
import { sendPostmarkBulk, type PostmarkBulkRequest } from "./postmark.client";

const request: PostmarkBulkRequest = {
  From: "sender@example.com",
  Subject: "Newsletter",
  HtmlBody: "<p>Hello</p>",
  TextBody: "Hello",
  MessageStream: "broadcast",
  Messages: [{ To: "guest@example.com" }],
};

let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
afterEach(() => fetchSpy?.mockRestore());

test("a broadcast above 10,000 recipients uses one Bulk submission", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
    Response.json({ Id: "bulk-test" }),
  );
  const Messages = Array.from({ length: 10_001 }, (_, i) => ({
    To: `guest${i}@example.com`,
  }));
  await sendPostmarkBulk("test-token", { ...request, Messages });
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const body = JSON.parse(
    fetchSpy.mock.calls[0]![1]!.body as string,
  ) as PostmarkBulkRequest;
  expect(body.Messages).toHaveLength(10_001);
});

test("rejects a payload above 50 MB by UTF-8 byte size without submitting", async () => {
  fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(
    new Error("Must not submit"),
  );
  // Fewer than 50 million characters, but more than 50 million encoded bytes.
  const error: unknown = await sendPostmarkBulk("test-token", {
    ...request,
    HtmlBody: "é".repeat(25_000_001),
  }).catch((error: unknown) => error);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toContain("50 MB payload limit");
  expect(fetchSpy).not.toHaveBeenCalled();
});
