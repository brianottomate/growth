import { z } from "zod";

/** Wire results for this capability. Dates are ISO strings after JSON normalization. */
export const listPlaybooksActionOutputSchema = z.strictObject({
  playbooks: z.array(
    z.strictObject({
      id: z.string(),
      kind: z.enum([
        "positioning",
        "procedure",
        "product-reference",
        "reply-guide",
      ]),
      summary: z.string(),
      title: z.string(),
    }),
  ),
});

export const readPlaybookActionOutputSchema = z.strictObject({
  body: z.string(),
  id: z.string(),
  kind: z.enum([
    "positioning",
    "procedure",
    "product-reference",
    "reply-guide",
  ]),
  title: z.string(),
});
