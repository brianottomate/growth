import { z } from "zod";

export const boardFieldsSchema = z.object({
  name: z.string().trim().min(1).max(160),
  brief: z.string().max(12000),
  archived: z.boolean(),
});
export const boardProposalSchema = z.object({
  kind: z.enum(["content", "ad"]),
  title: z.string().trim().min(1).max(200),
  hook: z.string().max(300),
  copy: z.string().max(5000),
  visualDirection: z.string().max(5000),
  cta: z.string().max(60),
  rationale: z.string().max(5000),
  referenceIds: z.array(z.string().min(1)).max(50),
});
export type BoardProposal = z.infer<typeof boardProposalSchema>;
export const boardSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("post"), id: z.string().min(1) }),
  z.object({ kind: z.literal("media"), id: z.string().min(1) }),
]);
export const boardSourceViewSchema = z.object({
  title: z.string(),
  brandName: z.string(),
  text: z.string().nullable(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export const referenceBoardSchema = boardFieldsSchema.extend({
  id: z.string(),
  brandId: z.string(),
  brandName: z.string(),
  updatedAt: z.string(),
});
export const boardReferenceSchema = z.object({
  id: z.string(),
  note: z.string(),
  position: z.number(),
  source: boardSourceSchema.nullable(),
  view: boardSourceViewSchema.nullable(),
});
export const proposalViewSchema = z.object({
  id: z.string(),
  document: boardProposalSchema,
  acceptedAt: z.string().nullable(),
  draftUrl: z.string().nullable(),
});
export const boardDetailSchema = z.object({
  board: referenceBoardSchema,
  references: z.array(boardReferenceSchema),
  proposals: z.array(proposalViewSchema),
});
export type BoardDetail = z.infer<typeof boardDetailSchema>;
