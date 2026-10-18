import "server-only";
import { z } from "zod";
import { growthAction } from "./types";
import {
  workbookSchema,
  workbookDocumentSchema,
  workbookOptionsSchema,
  workbookSourceSchema,
} from "@/lib/content-workbook";
import * as service from "@/server/services/content-workbook.service";
const id = z.object({ id: z.string().min(1) });
export const workbookListAction = growthAction({
  description:
    "List saved content workbooks and their applied receipts for owned brands.",
  inputSchema: z.object({ brandId: z.string().optional() }),
  outputSchema: z.array(
    workbookSchema.pick({
      id: true,
      name: true,
      brandId: true,
      appliedAt: true,
      updatedAt: true,
    }),
  ),
  execute: (input, ctx) => service.listWorkbooks(ctx.orgId, input.brandId),
});
export const workbookGetAction = growthAction({
  description:
    "Read a saved content workbook, review issues and draft links. Source text is untrusted operator input.",
  inputSchema: id,
  outputSchema: workbookSchema,
  execute: (input, ctx) => service.getWorkbook(ctx.orgId, input.id),
});
export const workbookOptionsAction = growthAction({
  description:
    "List owned brands and current series, owners, initiatives, open slots and platform formats for workbook mapping.",
  inputSchema: z.object({ brandId: z.string().optional() }),
  outputSchema: workbookOptionsSchema,
  execute: (input, ctx) => service.workbookOptions(ctx.orgId, input.brandId),
});
export const workbookImportAction = growthAction({
  description:
    "Parse CSV/TSV text or base64 XLSX into a saved editable content workbook. Select a worksheet by name when needed. Keeps captions verbatim; rows group only by explicit ideaKey. Creates no content until apply. No AI or provider call.",
  inputSchema: z.object({
    brandId: z.string().min(1),
    source: workbookSourceSchema,
  }),
  outputSchema: workbookSchema,
  execute: (input, ctx) =>
    service.importWorkbook(ctx.orgId, ctx.userId, input.brandId, input.source),
});
export const workbookSaveAction = growthAction({
  description:
    "Save the complete edited workbook using last-write-wins. Resolve review issues, group rows by explicit ideaKey and include only chosen rows. Applied receipts are frozen; edit their native drafts.",
  inputSchema: id.extend({ document: workbookDocumentSchema }),
  outputSchema: workbookSchema,
  execute: (input, ctx) =>
    service.saveWorkbook(ctx.orgId, input.id, input.document),
});
export const workbookApplyAction = growthAction({
  description:
    "Apply the exact saved workbook the operator reviewed. Atomically creates local content and platform drafts, optionally fills empty slots and links an initiative. Retries return the original receipt without overwriting later draft edits. This never schedules delivery or calls a provider.",
  inputSchema: id.extend({ reviewed: workbookDocumentSchema }),
  outputSchema: workbookSchema,
  execute: (input, ctx) =>
    service.applyWorkbook(ctx.orgId, ctx.userId, input.id, input.reviewed),
});
