import "server-only";
import { z } from "zod";
import { browserEvidenceRunSchema } from "@/lib/browser-evidence";
import {
  recordBrowserEvidence,
  readBrowserEvidence,
} from "@/server/services/browser-evidence.service";
import { growthAction } from "./types";

export const importBrowserEvidence = growthAction({
  description:
    "Record an operator-supplied browser listening run and its observed evidence, decisions, reply drafts, and supplied posting receipts. This stores an immutable brand-scoped audit artifact. Reusing an identical run key replays the record; changed evidence requires a new key. It performs no browser activity, provider calls, posting, Slack broadcasts, or mention-queue writes. Receipt verification is limited to supplied URL identity and authorization text; it does not independently confirm a public reply.",
  inputSchema: browserEvidenceRunSchema,
  outputSchema: z.strictObject({
    id: z.string(),
    replayed: z.boolean(),
    count: z.number(),
    outcome: z.enum(["completed", "partial", "blocked"]),
  }),
  execute: recordBrowserEvidence,
});

export const getBrowserEvidence = growthAction({
  description:
    "Read brand-scoped browser evidence run summaries. Pass runId to read that run's captures and supplied posting receipts. These are recorded operator observations; live public status remains unverified. Global listening mentions are a separate queue.",
  inputSchema: z.object({
    brandId: z.string(),
    runId: z.string().optional(),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  outputSchema: z.strictObject({
    runs: z.array(
      z.strictObject({
        id: z.string(),
        runKey: z.string(),
        outcome: z.enum(["completed", "partial", "blocked"]),
        startedAt: z.string(),
        finishedAt: z.string(),
        report: z.string(),
        count: z.number(),
        captures: browserEvidenceRunSchema.shape.captures,
      }),
    ),
  }),
  execute: (input, context) => readBrowserEvidence(input, context.orgId),
});
