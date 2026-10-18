import { z } from "zod";

export const workbookRowSchema = z.object({
  sourceRow: z.number().int().positive(),
  include: z.boolean(),
  ideaKey: z.string().trim().min(1).max(200),
  title: z.string().max(500),
  caption: z.string().max(20000),
  platform: z.string().max(80),
  format: z.string().max(100),
  date: z.string().max(40),
  pillar: z.string().max(100),
  seriesId: z.string().max(200),
  ownerId: z.string().max(200),
  slotId: z.string().max(200),
  hook: z.string().max(5000),
  visualDirection: z.string().max(10000),
  cta: z.string().max(5000),
  keyword: z.string().max(200),
  kpi: z.string().max(1000),
});
export const workbookDocumentSchema = z
  .object({
    initiativeId: z.string().max(200),
    rows: z.array(workbookRowSchema).min(1).max(200),
  })
  .refine(
    (d) => new Set(d.rows.map((r) => r.sourceRow)).size === d.rows.length,
    "Source rows must be unique.",
  );
export type WorkbookRow = z.infer<typeof workbookRowSchema>;
export type WorkbookDocument = z.infer<typeof workbookDocumentSchema>;
export const workbookResultSchema = z.object({
  sourceRow: z.number(),
  contentPostId: z.string().nullable(),
  platformPostId: z.string().nullable(),
});
export const workbookSchema = z.object({
  id: z.string(),
  brandId: z.string(),
  name: z.string(),
  document: workbookDocumentSchema,
  warnings: z.array(z.string()),
  issues: z.array(z.string()),
  appliedAt: z.string().nullable(),
  updatedAt: z.string(),
  results: z.array(workbookResultSchema),
});
export const workbookOptionsSchema = z.object({
  brands: z.array(z.object({ id: z.string(), name: z.string() })),
  series: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      pillar: z.string().nullable(),
    }),
  ),
  owners: z.array(z.object({ id: z.string(), name: z.string() })),
  initiatives: z.array(z.object({ id: z.string(), name: z.string() })),
  slots: z.array(
    z.object({
      id: z.string(),
      title: z.string().nullable(),
      plannedAt: z.string().nullable(),
    }),
  ),
  formats: z.array(
    z.object({ id: z.string(), platform: z.string(), label: z.string() }),
  ),
});
export const workbookSourceSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["csv", "tsv", "xlsx"]),
  data: z.string().min(1).max(4_000_000),
  sheet: z.string().max(200).optional(),
});
