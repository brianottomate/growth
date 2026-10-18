import { z } from "zod";
import {
  performanceReportContent,
  performanceReportSnapshot,
  savePerformanceReportSchema,
} from "@/lib/performance-report";
import {
  getReportWorkspace,
  saveReportDraft,
  reviewReport,
  publishReport,
  revokeReportShare,
} from "@/server/services/performance-report.service";
import { growthAction } from "./types";

const reportDraft = z.object({
  id: z.string(),
  cycleId: z.string().nullable(),
  content: performanceReportContent,
});
const reportIdentity = z.object({
  brandId: z.string().min(1),
  reportId: z.string().min(1),
});
export const reportWorkspaceAction = growthAction({
  description:
    "Read a client's editable report drafts, billing cycles, and published links. Links are credentials; keep them private unless the operator asks to share them.",
  inputSchema: z.object({ brandId: z.string().min(1) }),
  outputSchema: z.object({
    clientName: z.string(),
    reports: z.array(reportDraft),
    cycles: z.array(z.object({ id: z.string(), period: z.string() })),
    shares: z.array(
      z.object({
        id: z.string(),
        reportId: z.string(),
        token: z.string(),
        path: z.string(),
        expiresAt: z.string().nullable(),
        revokedAt: z.string().nullable(),
        createdAt: z.string(),
      }),
    ),
  }),
  execute: (input, ctx) => getReportWorkspace(ctx.orgId, input.brandId),
});
export const saveReportDraftAction = growthAction({
  description:
    "Save a complete client report draft. Last write wins. Existing public links retain their published content. Supply source evidence for the figures; saving never publishes or sends.",
  inputSchema: savePerformanceReportSchema,
  outputSchema: reportDraft,
  execute: (input, ctx) => saveReportDraft(ctx.orgId, input),
});
export const reviewReportAction = growthAction({
  description:
    "Review the exact saved report for publication. Returns the public snapshot and fingerprint required to publish. Does not create a link.",
  inputSchema: reportIdentity,
  outputSchema: z.object({
    snapshot: performanceReportSnapshot,
    fingerprint: z.string(),
  }),
  execute: (input, ctx) =>
    reviewReport(ctx.orgId, input.brandId, input.reportId),
});
export const publishReportAction = growthAction({
  description:
    "Create a public report link for the reviewed snapshot after explicit user approval. Anyone with the link can read until expiry or revocation. Earlier links retain their content. Never sends a message.",
  inputSchema: reportIdentity.extend({
    fingerprint: z.string().length(64),
    expiresInDays: z.number().int().min(1).max(90),
  }),
  outputSchema: z.object({
    id: z.string(),
    path: z.string(),
    expiresAt: z.string(),
  }),
  execute: (input, ctx) => publishReport(ctx.orgId, input),
});
export const revokeReportShareAction = growthAction({
  description:
    "Revoke a published report link for this client. The draft and published snapshot remain stored. No message is sent.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    shareId: z.string().min(1),
  }),
  outputSchema: z.object({ revoked: z.boolean() }),
  execute: (input, ctx) => revokeReportShare(ctx.orgId, input),
});
