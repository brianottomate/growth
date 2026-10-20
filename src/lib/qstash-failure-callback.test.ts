import { expect, test } from "bun:test";
import { z } from "zod";
import { parseQstashFailureCallback } from "./qstash-failure-callback";

const jobSchema = z.object({ id: z.string(), runtimeId: z.string() });

test("QStash callback decoding binds the source URL, message and job body", () => {
  const expectedSourceUrl = "https://growth.example/api/jobs/email-broadcast";
  const body = JSON.stringify({
    sourceMessageId: "qstash-123",
    sourceBody: Buffer.from(
      JSON.stringify({ id: "job-1", runtimeId: "production" }),
    ).toString("base64"),
    url: expectedSourceUrl,
  });
  expect(
    parseQstashFailureCallback({ body, expectedSourceUrl, jobSchema }),
  ).toEqual({
    sourceMessageId: "qstash-123",
    job: { id: "job-1", runtimeId: "production" },
  });
  expect(() =>
    parseQstashFailureCallback({
      body,
      expectedSourceUrl: "https://growth.example/api/jobs/lifecycle",
      jobSchema,
    }),
  ).toThrow("Unexpected callback source");
});
