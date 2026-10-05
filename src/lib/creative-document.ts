import { z } from "zod";
import { emailDocumentDraftSchema } from "./email-document";

const text = z.string().max(100_000);
const asset = z.object({
  assetId: z.string().min(1),
  role: z.enum(["source", "reference", "style", "output"]),
  note: z.string().max(2_000).optional(),
});
export const creativeBriefSchema = z.object({
  purpose: text.default(""),
  audience: text.default(""),
  direction: text.default(""),
  facts: z
    .array(z.object({ claim: text, sourceUrl: z.string().url().optional() }))
    .default([]),
  constraints: z.array(text).default([]),
  cta: text.default(""),
  assets: z.array(asset).default([]),
});
const base = { schemaVersion: z.literal(1), brief: creativeBriefSchema };
export const articleContentSchema = z.object({
  title: z.string().max(300),
  slug: z.string().max(200),
  description: z.string().max(2_000),
  bodyMarkdown: text,
  authorName: z.string().default("Wander"),
  heroAssetId: z.string().optional(),
  // Dato blocks survive pulls and metadata edits. Rewriting prose deliberately replaces the body.
  datoBody: z.record(z.string(), z.json()).optional(),
  datoItemId: z.string().optional(),
  datoAuthorId: z.string().optional(),
  review: z.object({ verdict: z.string(), findings: z.array(text) }).optional(),
});
export const imageContentSchema = z.object({
  composition: text.default(""),
  overlayCopy: text.default(""),
  avoid: text.default(""),
  aspectRatio: z.string().default("1:1"),
  outputFormat: z.enum(["png", "jpeg", "webp"]).default("png"),
  mode: z.enum(["generate", "edit", "compose"]).default("generate"),
  selectedAssetId: z.string().optional(),
});
export const videoContentSchema = z
  .object({
    script: text.default(""),
    aspectRatio: z.string().default("9:16"),
    durationSeconds: z.number().positive().max(3600).optional(),
    scenes: z
      .array(
        z.object({
          id: z.string().min(1),
          direction: text,
          durationSeconds: z.number().positive(),
          narration: text.default(""),
          overlayCopy: text.default(""),
          sourceAssetIds: z.array(z.string()).default([]),
          transition: z.string().optional(),
        }),
      )
      .default([]),
    audioDirection: text.default(""),
    captions: z.boolean().default(true),
    coverAssetId: z.string().optional(),
    selectedAssetId: z.string().optional(),
  })
  .refine(
    (v) => new Set(v.scenes.map((s) => s.id)).size === v.scenes.length,
    "Scene IDs must be unique",
  );
export const creativeDocumentSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("article"),
    content: articleContentSchema,
  }),
  z.object({
    ...base,
    type: z.literal("email"),
    content: emailDocumentDraftSchema,
  }),
  z.object({ ...base, type: z.literal("image"), content: imageContentSchema }),
  z.object({ ...base, type: z.literal("video"), content: videoContentSchema }),
]);
export type CreativeDocument = z.infer<typeof creativeDocumentSchema>;
export type CreativeBrief = z.infer<typeof creativeBriefSchema>;
export const creativeDocumentTypes = [
  "article",
  "email",
  "image",
  "video",
] as const;
export function emptyCreativeDocument(
  type: CreativeDocument["type"],
  title = "",
): CreativeDocument {
  const content =
    type === "email"
      ? { subject: title, bodyMarkdown: "" }
      : type === "article"
        ? { title, slug: "", description: "", bodyMarkdown: "" }
        : {};
  return creativeDocumentSchema.parse({
    type,
    schemaVersion: 1,
    brief: {},
    content,
  });
}
