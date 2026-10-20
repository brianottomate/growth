import { z } from "zod";

const qstashFailureCallbackSchema = z.object({
  sourceMessageId: z.string().min(1),
  sourceBody: z.string().min(1).max(4_096),
  url: z.string().url(),
});

/** Shared, signature-independent decoding contract for QStash callbacks. */
export function parseQstashFailureCallback<T>(input: {
  body: string;
  expectedSourceUrl: string;
  jobSchema: z.ZodType<T>;
}) {
  const callback = qstashFailureCallbackSchema.parse(JSON.parse(input.body));
  if (callback.url !== input.expectedSourceUrl)
    throw new Error("Unexpected callback source");
  const job = input.jobSchema.parse(
    JSON.parse(Buffer.from(callback.sourceBody, "base64").toString("utf8")),
  );
  return { job, sourceMessageId: callback.sourceMessageId };
}
